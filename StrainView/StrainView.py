#!/usr/bin/env python
# -*- coding: latin-1 -*-
import logging
import unicodedata
import json
import os,io
import sys
import tkinter as tk
from sched import scheduler
import time
from tkinter import *                
from tkinter import font  as tkfont 
from PIL import Image, ImageTk
from datetime import datetime,timedelta
from threading import Timer
from _codecs import decode
#from pywinauto.win32defines import BACKGROUND_BLUE
sys.path.append('../Modules')

logname = "StrainView.log"
AppName ="StrainView"
AppVersion  ="1.0"


logging.basicConfig(filename=logname,
                            filemode='a',
                            format='%(asctime)s,%(msecs)d %(name)s %(levelname)s %(message)s',
                            datefmt='%H:%M:%S',
                            level=logging.DEBUG)
appsettings = 0
s = scheduler(time, time.sleep)





class AppMain(tk.Tk):
    def __init__(self, *args, **kwargs):
        tk.Tk.__init__(self, *args, **kwargs)
        self.mp_stat = None
        self.iomodulestat = None
        self.paymentdatafile = None
        Appsetting =  appsettings.get('App', {'xpos':0})
        self.debug = Appsetting.get('Debug',False)
        xpos = Appsetting.get ('xpos',0)
        fullscreen = Appsetting.get ('fullscreen',1)
        self.title_font = tkfont.Font(family='ApexSansMediumT', size=36, weight="bold")
        self.background = 'white'
        root = tk.Tk._root(self)
        if fullscreen:
            root.overrideredirect(True)
            root.state('zoomed')
        root.call('encoding', 'system', 'utf-8')
        wininfo =  ("Geo Info Screen high: " + str(root.winfo_screenheight()) + "Screen width: "+str(root.winfo_screenwidth()))
        logging.info("WinInfo" + str(wininfo))
        print (wininfo)

        localwin = ("{0}x{1}+{2}+0".format(root.winfo_screenwidth(), root.winfo_screenheight(), xpos))
        geo_pos = Appsetting.get ('geo_pos',localwin)
        root.geometry(geo_pos)

        #root.attributes('-fullscreen', True)
        
        self.container = tk.Frame(self)
        self.container.pack(side="top", fill="both", expand=True)
        self.container.grid_rowconfigure(0, weight=1)
        self.container.grid_columnconfigure(0, weight=1)
        self.container.config(background = self.background)
        # self.setupcoinoktimer()
        self.frames = {}
        for F in (StartPage,OfflinePage):
            page_name = F.__name__
            frame = F(parent=self.container, controller=self)
            self.frames[page_name] = frame

            # put all of the pages in the same location;
            # the one on the top of the stacking order
            # will be the one that is visible.
            frame.grid(row=0, column=0, sticky="nsew")
            frame.configure(background=self.background)

            self.show_frame("StartPage")

        
    def quit(self):
        self.root.destroy      
        
    def PaymentStatus(self):
        print("Payment status")
        paied = False
        if self.mp is not None:
            success, response = self.mp.GetPaymentStatus(self.orderid)
            print(response)
            if success:
                paied = response['PaymentStatus'] ==100
                idle = response['PaymentStatus'] ==10
                canceled = response['PaymentStatus'] ==40
            else:
                self.ft = Timer(5.0, self.FrameTimeOut, ["OfflinePage"])
                self.ft.start() 
                return

            
        if self.mp.Checkedin:   
            self.show_frame("SwipePayment")
            self.mp.Checkedin = False   
        if not paied and not idle and not canceled:    
            self.after(1000, self.PaymentStatus)
        elif paied:
            self.pt.cancel()
            self.ft = Timer(5.0, self.FrameTimeOut, ["paied"]) 
            self.ft.start()    
            self.show_frame("PaymentAccepted") 
            logging.info("PaymentAccepted, orderid: " + str(response['OrderId']))
            self.paymentHandle(response)
        elif canceled: 
            self.pt.cancel()
            self.ft = Timer(5.0, self.FrameTimeOut, ["PaymentFailed"]) 
            self.ft.start()    
            self.show_frame("PaymentFailed")     
        else:
            self.pt.cancel()
            #self.ft = Timer(5.0, self.FrameTimeOut, ["PaymentFailed"]) 
            #self.ft.start()    
            #self.show_frame("PayWithMobilePay")     
        
    def PulseCntGetter(self, amount):
        switcher = {
                    50: 1,
                    100: 2,
                    200: 3,
                    }
        res = switcher.get(amount, 0)
        print (res)
        return res 


        
    def show_frame(self, page_name):
        '''Show a frame for the given page name'''
        frame = self.frames[page_name]
        frame.tkraise()

    
                  
   
class OfflinePage(tk.Frame):

    def __init__(self, parent, controller):
        tk.Frame.__init__(self, parent)
        self.controller = controller
        label = tk.Label(self, text="Strainview", font=controller.title_font,background=controller.background)
        label.pack(side="top", fill="x", pady=5)
        
class StartPage(tk.Frame):

    def __init__(self, parent, controller):
        tk.Frame.__init__(self, parent)
        self.controller = controller
        label = tk.Label(self, text="Strainview", font=controller.title_font,background=controller.background)
        label.pack(side="top", fill="x", pady=5)


        
    def showFrame(self,cont):
        rame = self.frames[cont]
        frame.tkraise()
        frame.update()
        frame.event_generate("<<ShowFrame>>")
          
def WriteSetupFile(data):
    FilePath = 'C:\\ProgramData\\DinoCoin\\DinoPay\\'
    mainsetupfile =FilePath+ 'DinoPaySetup.json'
    try:
        with io.open(mainsetupfile, 'w') as setfile:
                setfile.write(json.dumps(data))
    except Exception as e: 
            print('Error in setup write file: ' + mainsetupfile, e)

    
def ReadSetupFile():
    FilePath = 'C:\\ProgramData\\sefco\\StrainView\\'
    mainsetupfile =FilePath+ 'StrainView.json'
    
   
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
   # try:
        logging.info("Running StrainView")
        logging.info("Reading Setupfile")
        appsettings = ReadSetupFile()
        app = AppMain()
        x=datetime.today()
        y = x.replace(day=x.day, hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        delta_t=y-x       
        secs=delta_t.total_seconds()

        app.mainloop()
