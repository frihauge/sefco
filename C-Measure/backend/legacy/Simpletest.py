
import sys
import time
import traceback
from Phidget22.Devices.VoltageRatioInput import *
from Phidget22.PhidgetException import *
from Phidget22.Phidget import *
from Phidget22.Net import *

NUM_CHANNELS = 2
NUM_PORTS = 2

INVALID_VALUE = 1e300
ch = [VoltageRatioInput() for i in range (0, NUM_PORTS*NUM_CHANNELS)]
def initphidget():
    Net.enableServerDiscovery(PhidgetServerType.PHIDGETSERVER_DEVICEREMOTE)
    i = -1
    for p in range (0, NUM_PORTS):
            for c in range (0, NUM_CHANNELS):
                i = i+1
                ch[i].setHubPort(p)
                ch[i].setIsHubPortDevice(0)
                ch[i].setChannel(c)
                ch[i].setIsRemote(True)
                ch[i].setOnAttachHandler(onAttachHandler)
                ch[i].setOnVoltageRatioChangeHandler(onVoltageRatioChangeHandler)
                ch[i].channelIndex = i
                ch[i].isReady = False
                ch[i].openWaitForAttachment(5000)
                
    
def tryToPrint():
    #Check if all channels have gathered new data yet
    for i in range (0, NUM_CHANNELS):
        if (not ch[i].isReady):
            return

    #If all channels have new data, print the values on-screen
    print("Values:")
    for i in range (0, NUM_CHANNELS):
        ch[i].isReady = 0
        if (i % 8 == 0):
            sys.stdout.write("\n")
        if (ch[i].value != INVALID_VALUE):
            sys.stdout.write("%7s" % (str(ch[i].value)) + " |")
        else:
            sys.stdout.write("  SAT   |")
    
    sys.stdout.write("\n\n")
    sys.stdout.flush()
    
def onVoltageRatioChangeHandler(self, sensorValue):

    #If you are unsure how to use more than one Phidget channel with this event, we recommend going to
    #www.phidgets.com/docs/Using_Multiple_Phidgets for information
    self.value = sensorValue
    ph = self
    deviceSerialNumber = ph.getDeviceSerialNumber()
    port = int(ph.getHubPort())
    channel = int(ph.getChannel())
    index = (port<<1) +channel
   # print(deviceSerialNumber)
    print("Sensor "+ str(index)+ "Voltage Ratio: " + str(sensorValue))


def onAttachHandler(self):
    ph = self
    deviceSerialNumber = ph.getDeviceSerialNumber()
    port = int(ph.getHubPort())
    channel = int(ph.getChannel())
    index = (port<<1) +channel
    ch[index].isReady = True
 
if __name__ == '__main__':
    try:
        initphidget()
    except Exception as e:
        print("main exception:" +str(e))