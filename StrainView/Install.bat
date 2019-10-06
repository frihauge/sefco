
pyinstaller.exe --onefile -p ../Modules wrapview.py
copy .\img\*.png .\dist\img /y
"c:\Program Files (x86)\Inno Setup 5\iscc.exe"  .\Installer\Installer.iss


rem copy .\Installer\Output\DinoViewSetup.exe  C:\Users\esben\"Google Drev"\Programs\ServiceApp