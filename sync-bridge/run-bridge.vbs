' JAPA DTR Sync Bridge - Silent Background Runner
' Runs pythonw.exe completely invisible without popping up a console window

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

strScriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
strPython = strScriptDir & "\venv\Scripts\pythonw.exe"
strBridge = strScriptDir & "\bridge.py"

' Run with window style 0 (hidden) and bWaitOnReturn = False
objShell.CurrentDirectory = strScriptDir
objShell.Run """" & strPython & """ """ & strBridge & """", 0, False
