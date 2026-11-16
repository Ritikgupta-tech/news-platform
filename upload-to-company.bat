@echo off
echo =====================================================================
echo  Ashivam Technologies - Publishing E News Platform to Company GitHub
echo =====================================================================
echo.

git push -u company main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] Repository successfully uploaded to Ashivam Technologies!
    echo URL: https://github.com/AshivamTechnologies/e-news
) else (
    echo.
    echo [ACTION REQUIRED] The repository could not be found yet on GitHub.
    echo 1. Go to: https://github.com/organizations/AshivamTechnologies/repositories/new
    echo 2. Repository name: e-news
    echo 3. Click 'Create repository' (leave it empty)
    echo 4. Run this script again!
)
echo.
pause
