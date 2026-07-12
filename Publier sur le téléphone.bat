@echo off
title Publication Coach Guitare IA
cd /d "%~dp0"
git add -A
git commit -m "Mise a jour de l'application"
git push
echo.
echo ===============================================
echo  Publie ! Recharge la page sur ton iPhone
echo  dans une minute pour voir les changements.
echo ===============================================
pause
