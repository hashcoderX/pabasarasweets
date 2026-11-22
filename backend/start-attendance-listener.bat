@echo off
REM Fingerprint attendance listener - keeps running and restarts automatically if it stops.
REM One-time firewall setup (run in an Administrator Command Prompt):
REM   netsh advfirewall firewall add rule name="Attendance Listener UDP" dir=in action=allow protocol=UDP localport=5055
REM   netsh advfirewall firewall add rule name="Attendance Listener TCP" dir=in action=allow protocol=TCP localport=5055
title Attendance Listener
cd /d "%~dp0"
set PHP_BIN=php
where php >nul 2>nul || set PHP_BIN=C:\xampp\php\php.exe

:loop
"%PHP_BIN%" artisan attendance:listen
echo Listener stopped. Restarting in 5 seconds... (close this window to stop)
timeout /t 5 /nobreak >nul
goto loop
