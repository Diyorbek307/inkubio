@echo off
rem Double-click: new site orders will also arrive in Telegram (see tools\telegram-setup.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\telegram-setup.ps1"
