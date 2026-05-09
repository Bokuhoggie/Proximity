@echo off
REM Launch the Proximity backup poller and keep it running.
REM Drop a shortcut to this file in shell:startup to autostart on Windows boot.
cd /d "%~dp0\.."
node scripts\backup.js
pause
