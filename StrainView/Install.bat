
pyinstaller.exe  --onefile wrapview.py
copy .\img\*.png .\dist\img /y
"c:\Program Files (x86)\Inno Setup 5\iscc.exe"  .\Installer\Installer.iss

