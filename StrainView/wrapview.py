import logging
from PyQt5 import QtGui
from PyQt5.QtCore import *
# import unicodedata
import json
import os
import io
import time
import sys
import csv
from collections import OrderedDict
from datetime import datetime, timedelta
from threading import Thread
from PyQt5.QtWidgets import QWidget, QMainWindow, QApplication, QAction, QTableWidget, QTableWidgetItem, QVBoxLayout, QPushButton, QSizePolicy
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.backends.backend_qt4agg import NavigationToolbar2QT as NavigationToolbar
import matplotlib.pyplot as plt
from matplotlib.transforms import Affine2D
import mpl_toolkits.axisartist.floating_axes as floating_axes
from matplotlib.figure import Figure
from Phidget22.Devices.VoltageRatioInput import *
from Phidget22.PhidgetException import *
from Phidget22.Phidget import *
from Phidget22.Net import *
from multiprocessing import Process, Queue
from numpy.distutils.fcompiler import none
if hasattr(sys, 'frozen'):
    os.environ['PATH'] = sys._MEIPASS + ";" + os.environ['PATH']
NUM_CHANNELS = 2
NUM_PORTS = 6
NUM_MEAS_IDS = NUM_CHANNELS * NUM_PORTS
INVALID_VALUE = 1e300

logname = "WrapView.log"
AppName = "WrapView"
AppVersion = "1.0"

vals = [0 for i in range (0, NUM_MEAS_IDS)]
ch = [VoltageRatioInput() for i in range (0, NUM_MEAS_IDS)]
qdata  = Queue()
qcontrol = Queue()
qconnectStatus = Queue()

logging.basicConfig(filename=logname,
                    filemode='a',
                    format='%(asctime)s,%(msecs)d %(name)s %(levelname)s %(message)s',
                    datefmt='%H:%M:%S',
                    level=logging.DEBUG)
appsettings = 0


class PhidgetMeas(Thread):

    def __init__(self, AppSettings=None, target=None,
                 args=(), kwargs=None, verbose=None):
        super(PhidgetMeas, self).__init__()
        self.AppSettings = AppSettings
        calibvaluelist = appsettings.get('CalibVal', {1:0})
        AutoCalibStartUp = appsettings.get('AutoCalStart', False)
        self.calibrate = AutoCalibStartUp
        #self.initphidget()
        self.CalibCount = 3
         
    def run(self):
        while True:
            while not qcontrol.empty():
                item = qcontrol.get()
                if item[0] == 'Connect':
                    self.closeall()
                    self.initphidget()
                if  item[0] == 'GetMeasurement':
                    if not qdata.full():
                        for i in ch:
                            if i.isReady:
                                qdata.put((i.channelIndex, i.value))
        pass


    def storeCalibvalues(self):
        for i in ch:
            cavg = sum(i.CalibValues) / len(i.CalibValues)
            self.AppSettings["CalibVal"][i.CalibValues] = cavg
        WriteSetupFile(self.AppSettings)
        return 
    def onErrorHandler(self,phiobj, code, description):
        print("Code: " + str(code))
        print("Description: " + description)
        ph = phiobj
        deviceSerialNumber = ph.getDeviceSerialNumber()
        port = int(ph.getHubPort())
        channel = int(ph.getChannel())
        index = (port << 1) + channel
        ch[index].isReady = False
        if not qconnectStatus.full():
            qconnectStatus.put((index, str('Error:'+description)))


    def onVoltageRatioChangeHandler(self, phself, sensorValue):
        calibstat = True
        # If you are unsure how to use more than one Phidget channel with this event, we recommend going to
        # www.phidgets.com/docs/Using_Multiple_Phidgets for information
        phself.value = sensorValue
        ph = phself
        deviceSerialNumber = ph.getDeviceSerialNumber()
        port = int(ph.getHubPort())
        channel = int(ph.getChannel())
        index = (port << 1) + channel
       # print(deviceSerialNumber)
        # print("Sensor "+ str(index)+ "Voltage Ratio: " + str(sensorValue))
        

    def onAttachHandler(self, phiobj):
        ph = phiobj
        deviceSerialNumber = ph.getDeviceSerialNumber()
        port = int(ph.getHubPort())
        channel = int(ph.getChannel())
        index = (port << 1) + channel
        ch[index].isReady = True
        if not qconnectStatus.full():
            qconnectStatus.put((index, 'Connected'))
            
    def initphidget(self):
        Net.enableServerDiscovery(PhidgetServerType.PHIDGETSERVER_DEVICEREMOTE)
        i = -1
        for p in range (0, NUM_PORTS):
            for c in range (0, NUM_CHANNELS):
                try:
                    i = i + 1
                    ch[i].setHubPort(p)
                    ch[i].setIsHubPortDevice(0)
                    ch[i].setChannel(c)
                    ch[i].setIsRemote(True)
                    ch[i].setOnAttachHandler(self.onAttachHandler)
                    ch[i].setOnVoltageRatioChangeHandler(self.onVoltageRatioChangeHandler)
                    ch[i].setOnErrorHandler(self.onErrorHandler)
                    ch[i].channelIndex = i
                    ch[i].isReady = False
                    ch[i].CalibValues = []
                    if not qconnectStatus.full():
                        qconnectStatus.put((i, 'Connecting'))
          
                    ch[i].openWaitForAttachment(2000)
                except:
                    print("Error in no" + str(i))
                    
    def closeall(self):
        i = -1
        for p in range (0, NUM_PORTS):
            for c in range (0, NUM_CHANNELS):
                try:
                    i = i + 1
                    ch[i].close()
                except:
                    print("Error in no" + str(i))
        time.sleep(1)

class App(QWidget):

    def __init__(self):
        super().__init__()
        self.title = 'Measurementtable '
        self.left = 0
        self.top = 0
        self.width = 1024
        self.height = 960
        self.gplot = None
        self.FilePath = 'C:\\ProgramData\\sefco\\WrapView\\'
        self.calfilename = self.FilePath + 'caldata.csv'
        self.caldata = []
        self.readCalData()
        self.initUI()
        self.showmeasdata = False
        self.runningmeasure = False
        self.timerrun = False
        self.timersetup()

    def say_hello(self):                                                                                     
        print("Button clicked, Hello!")
        
    def initUI(self):
        self.setWindowTitle(self.title)
        self.setGeometry(self.left, self.top, self.width, self.height)
        self.createButtons()
        self.createTable()
        
        # Add box layout, add table to box layout and add box layout to widget
        self.layout = QVBoxLayout()
        self.layout.addWidget(self.connectbutton)
        self.layout.addWidget(self.updatebutton)
        self.layout.addWidget(self.MakeMeasurebutton)
        
        
        self.layout.addWidget(self.tableWidget) 

        self.gplot = PlotCanvas(self, width=5, height=4)
        self.gplot.move(0, 0)
        self.layout.addWidget(self.gplot)
        self.setLayout(self.layout) 
        self.gplot.pltupdate()

    def createButtons(self):
        # Create table
        self.connectbutton = QPushButton('Connect', self)
        self.connectbutton.setToolTip('Connect the phidgets')
        self.connectbutton.move(100, 70)
        self.connectbutton.clicked.connect(self.connect_on_click)
        self.updatebutton = QPushButton('Continueous Measure', self)
        self.updatebutton.setToolTip('Update the plot')
        self.updatebutton.move(100, 70)
        self.updatebutton.clicked.connect(self.update_on_click)
        self.MakeMeasurebutton = QPushButton('AddMeasurement', self)
        self.MakeMeasurebutton.setToolTip('AddMeasurement')
        self.MakeMeasurebutton.move(100, 70)
        self.MakeMeasurebutton.clicked.connect(self.AddMeasurement_click)
        
        

    def createTable(self):
        # Create table
        self.tableWidget = QTableWidget()
        self.tableWidget.verticalHeader().setVisible(False)
        self.tableWidget.horizontalHeader().setVisible(True)
        self.tableWidget.setRowCount(NUM_MEAS_IDS)
        self.tableWidget.setColumnCount(5)
        self.tableWidget.setHorizontalHeaderItem(0, QTableWidgetItem("Load cell Number"))
        self.tableWidget.setHorizontalHeaderItem(1, QTableWidgetItem("Connect Status"))
        self.tableWidget.setHorizontalHeaderItem(2, QTableWidgetItem("Cal_Multiplier"))
        self.tableWidget.setHorizontalHeaderItem(3, QTableWidgetItem("Cal_Adder"))
        self.tableWidget.setHorizontalHeaderItem(4, QTableWidgetItem("Measured Load"))        
        for mId in range (0, NUM_MEAS_IDS):
            self.tableWidget.setItem(mId, 0, QTableWidgetItem("Cell_"+ str(mId)))
            self.tableWidget.setItem(mId, 1, QTableWidgetItem("Disconnected"))
            self.tableWidget.setItem(mId, 2, QTableWidgetItem(self.caldata[mId]['Multiplier']))
            self.tableWidget.setItem(mId, 3, QTableWidgetItem(self.caldata[mId]['Addend']))
            self.tableWidget.setItem(mId, 4, QTableWidgetItem("Value"))
        self.tableWidget.move(0, 0)

    @pyqtSlot()
    def update_on_click(self):
        if not self.runningmeasure:
            self.updatebutton.setStyleSheet("background-color:green;")
            self.showmeasdata = True
            self.startfreeruntimer()
        else:
            self.updatebutton.setStyleSheet("")
            self.showmeasdata = False
            self.stopfreeruntimer()

        self.runningmeasure = not self.runningmeasure

        self.updatemeasuemntdata()
        
    def AddMeasurement_click(self):
        self.updatemeasuemntdata(clearplot=False)
        self.writecsvdatafile(vals)
        
        
    def connect_on_click(self):
        if not qcontrol.full():
            qcontrol.put(("Connect", True))
        self.update2()
        self.startfreeruntimer()
        
    def startfreeruntimer(self):
        self.timerrun = True 
        self.timer.start()

    def stopfreeruntimer(self):
        self.timerrun = False
        self.timer.stop()


    def timersetup(self):
        self.timer = QTimer()
        self.timer.setInterval(1000)
        self.timer.timeout.connect(self.update2)
        if self.timerrun:
            self.timer.start()
            
    def updatemeasuemntdata(self, clearplot=True):
        if not qcontrol.full():
            qcontrol.put(("GetMeasurement", True))
            time.sleep(0.2)
        while not qdata.empty():
            item = qdata.get()
            idn = int(item[0])
            measvalue = float(item[1])
            value = self.GetCalibratedValue(idn, measvalue)
            strval = "{:.5f}".format(value)
            self.tableWidget.setItem(idn, 4, QTableWidgetItem(strval))
            vals[idn] = value
        if self.gplot is not None:
            if clearplot:
                self.gplot.clearplots()
            self.gplot.pltupdate()

    def update2(self):
        while not qconnectStatus.empty():
            item = qconnectStatus.get()
            if item[1] == 'Connecting':
                self.tableWidget.setItem(int(item[0]), 1, QTableWidgetItem('Connecting'))
                self.tableWidget.item(int(item[0]),1).setBackground(QtGui.QColor(Qt.yellow)) 
            elif item[1] == 'Connected':
                self.tableWidget.setItem(int(item[0]), 1, QTableWidgetItem('Connected'))
                self.tableWidget.item(int(item[0]),1).setBackground(QtGui.QColor(Qt.green)) 
            elif 'Error:' in item[1]:
                self.tableWidget.setItem(int(item[0]), 1, QTableWidgetItem('Error'))
                self.tableWidget.item(int(item[0]),1).setBackground(QtGui.QColor(Qt.red)) 
        if self.showmeasdata:
            self.updatemeasuemntdata()
            # print(item)
    
    def readCalData(self):
        if not os.path.exists(os.path.dirname(self.calfilename)):
            try:
                os.makedirs(os.path.dirname(self.calfilename))
            except Exception as e: 
                print('StrainView make dirs read error: ' + self.calfilename, e)
        if not os.path.exists(self.calfilename):
            try:
                open(self.calfilename, mode='w+')
            except Exception as e: 
                print('StrainView make caldatafile error: ' + self.calfilename, e)

        for mId in range(0, NUM_MEAS_IDS):
            self.caldata.append(OrderedDict([('LoadCell', '0'), ('Multiplier', '1'), ('Addend', '0')]))
    
        with open(self.calfilename, mode='r') as csv_file:
            self.csvdata = csv.DictReader(csv_file)
            line_count = 0
            try: 
                for row in self.csvdata:
                    id = int(row['LoadCell'])
                    self.caldata[id] = row
                    print(row)
            except Exception as e:
                print('Parsing caldata file error ', e)
        csv_file.close()

    def writecsvdatafile(self, vals):
        timestr = time.strftime("%Y%m%d-%H%M%S")
        filename = "Data_"+timestr+".csv"
        with open(self.FilePath + filename, mode='w+', newline='') as csv_file:
            fields = ['LoadCell', 'MeasuredValue']
            writer = csv.DictWriter(csv_file, fieldnames=fields)
            writer.writeheader()
            for idx, data in enumerate(vals):
                row = OrderedDict([('LoadCell', idx), ('MeasuredValue', data)])
                writer.writerow(row)
   
        print("writing completed")
        csv_file.close()
    def GetCalibratedValue(self, id, value):
        try:
            calMval = float(self.caldata[id]['Multiplier'])
            calAval = float(self.caldata[id]['Addend'])
        except Exception as e:
                print('caldata calulate error ', e) 
        try:
            calval = (value*calMval)+calAval
        except Exception as e:
            print('Calculating caldata error ', e)   
        return calval
   
    def writecaldata(self):
        data = [{'LoadCell' : 1, 'Multiplier': 1, 'Addend': 0}]
        with open(self.calfilename, 'w') as csv_file:
            fields = ['LoadCell', 'Multiplier', 'Addend']
            writer = csv.DictWriter(csv_file, fieldnames=fields)
            writer.writeheader()
            writer.writerows(data)
        print("writing completed")
        csv_file.close()

                 

class PlotCanvas(FigureCanvas):

    def __init__(self, parent=None, width=5, height=4, dpi=100):
        # plt.style.use('classic')
        self.fig = Figure(figsize=(width, height), dpi=dpi)
       # self.axes = self.fig.add_subplot(111)
        
        FigureCanvas.__init__(self, self.fig)
        self.setParent(parent)

        FigureCanvas.setSizePolicy(self,
                QSizePolicy.Expanding,
                QSizePolicy.Expanding)
        FigureCanvas.updateGeometry(self)
        self.line = None
        self.plot()

    def pltupdate(self):
        self.ax.relim()
        self.ax.autoscale_view(True)
        self.ax.set_xlim(0,1)
        y = range(len(vals))
        x = vals
        #self.ax.clear()
        self.line = self.ax.plot(x, y, '.-')
        self.ax.set_title('Load plot')
        self.ax.set_ylabel('Cells')
        self.fig.canvas.draw()
        self.fig.canvas.flush_events()

    def barplot(self):
        x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        self.ax = self.figure.add_subplot(111)
        self.line = self.ax.barh(x, x, orientation="horizontal")   
        self.ax.set_title('Load plot')
        self.ax.set_ylabel('Cells')
    
    def plot(self):
        y = range(12)
        x = range(12)
        self.ax = self.figure.add_subplot(111)
        #self.ax.plot(x, y, 'o-')  
        self.ax.set_title('Load plot')
        self.ax.set_ylabel('Cells')
        self.ax.set_xlabel("Force") 
    
    def clearplots(self):
        self.ax.clear()
        
        # self.draw()


def WriteSetupFile(data):
    FilePath = 'C:\\ProgramData\\sefco\\WrapView\\'
    mainsetupfile = FilePath + 'WrapView.json'
    try:
        with io.open(mainsetupfile, 'w') as setfile:
                setfile.write(json.dumps(data))
    except Exception as e: 
            print('Error in setup write file: ' + mainsetupfile, e)


def ReadSetupFile():
    FilePath = 'C:\\ProgramData\\sefco\\WrapView\\'
    mainsetupfile = FilePath + 'WrapView.json'
    if not os.path.exists(os.path.dirname(mainsetupfile)):
        try:
            os.makedirs(os.path.dirname(mainsetupfile))
        except Exception as e: 
            print('StrainView make dirs read error: ' + mainsetupfile, e)

    if os.path.isfile(mainsetupfile) and os.access(mainsetupfile, os.R_OK):
        print ("Local StrainView exists and is readable")
    else:
        with io.open(mainsetupfile, 'w') as db_file:
            db_file.write(json.dumps({'App':{'xpos':2560}}))
    data = None
    with io.open(mainsetupfile, 'r') as jsonFile:
        try:
            data = json.load(jsonFile) 
        except Exception as e: 
            print('Error in setup file: ' + mainsetupfile, e)
    return data




    



if __name__ == '__main__':
    app = QApplication(sys.argv)
    ex = App()
    ex.show()
    logging.info("Running StrainView")

    logging.info("Reading Setupfile")
    appsettings = ReadSetupFile()
    logging.info("Reading CalibrationFile")
    appsettings = ReadSetupFile()
    # writecaldata()
    # readCalData()
    x = datetime.today()
    y = x.replace(day=x.day, hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    delta_t = y - x
    secs = delta_t.total_seconds()

    ph = PhidgetMeas(appsettings)
    ph.start()

    sys.exit(app.exec_()) 
