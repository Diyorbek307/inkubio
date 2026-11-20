@echo off
rem Double-click: puts the INKUBIO site on the internet from this computer (see tools\start-site.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-site.ps1"
