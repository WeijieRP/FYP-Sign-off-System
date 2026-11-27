RP Xperience Centre Kiosk: offline install package for Windows
===============================================================

This folder installs the kiosk on a 64 bit Windows 10 (version 1809 or newer) or Windows 11 PC. Nothing has to be
installed first. Node.js and MySQL 8.4 are inside the package and go into the kiosk's own folder
(C:\RPXperienceKiosk). MySQL runs on its own port (3307), so a Node.js or MySQL that is already on the PC is never
used or changed. The install needs no internet. (Some admin pages load scripts from the internet, and the online AI
options need it, but the kiosk itself runs without.)


INSTALL
  Double click install.cmd and answer the questions, or run it in a terminal in this folder, for example:
      install.cmd -Role WallPC
  It asks for the PC role (Laptop or Wall PC), the ports, the first admin account and its password, and whether
  data comes from an old PC. Windows asks once for administrator rights (MySQL service, firewall rule for tablets).
  If Windows asks "Do you want to run this file?", choose Run.
  At the end it starts the kiosk and prints the admin page address and the address tablets use.

ONE COMMAND INSTALL (downloads this same package and runs this same install.cmd)
  Paste into PowerShell:
      curl.exe -fsSLo "$env:TEMP\get-kiosk.ps1" https://github.com/Casualty97/FYP-Sign-off-System/releases/latest/download/get-kiosk.ps1; powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\get-kiosk.ps1"
  From another place (a SharePoint or OneDrive download link, a web server, a USB stick):
      powershell -NoProfile -ExecutionPolicy Bypass -File get-kiosk.ps1 -From <address, zip file or this folder>
  Options after these go to install.cmd, for example -Role WallPC.

UPDATE (all data is kept)
  Run install.cmd or update.cmd of a newer package, or C:\RPXperienceKiosk\app\update.cmd (downloads the newest).
  It backs up the database and settings first (C:\RPXperienceKiosk\data\backups). If any step fails, the previous
  version and the database are put back. Running the same package again repairs the install.

UNINSTALL
  C:\RPXperienceKiosk\app\uninstall.cmd, or uninstall.cmd in this folder.
  It removes exactly what the install made (the list is in C:\RPXperienceKiosk\data\install.json). Visitor data is
  kept in C:\RPXperienceKiosk\data and C:\RPXperienceKiosk\mysql-data, and a later install.cmd uses it again.
  To delete the visitor data too (asks you to type DELETE):
      uninstall.cmd -RemoveData

MOVE TO A NEW PC
  Old PC:  export-data.cmd                (an older copy of the project folder: export-data.cmd -Source <folder>)
  New PC:  install.cmd -ImportData <file>
  The file is locked with a passphrase you choose. It holds the database, the encryption key, settings, archives,
  visitor photos and uploaded pictures, so keep it private and delete it when the new PC works.

OPTIONS OF install.cmd
  -Role Laptop|WallPC      Laptop: nothing starts by itself. Wall PC: starts at sign in, desktop link, firewall rule.
  -InstallDir <folder>     default C:\RPXperienceKiosk
  -Port <number>           the kiosk server that tablets connect to, default 3000 (the kiosk screen server stays 3003)
  -MySqlPort <number>      the kiosk's MySQL, this PC only, default 3307
  -AdminUser <name>        the first admin account, default systemadmin
  -AdminPasswordFile <f>   its password for an unattended install (or the KIOSK_ADMIN_PASSWORD variable)
  -ImportData <file>       data from an old PC (passphrase typed, or the KIOSK_DATA_PASSPHRASE variable)
  -NoService               MySQL as a normal program of this user instead of a Windows service
  -NoFirewall              no firewall rule on a Wall PC
  -NoStart                 do not start the kiosk at the end
  -Check                   only the checks before installing; changes nothing
  -DryRun                  prints every step it would take; changes nothing
  -NonInteractive          no questions: options and defaults only
  -AllowDowngrade          allows going back to an older build
  Exit codes: 0 done, 1 failed (what it made is undone), 2 an administrator step is missing, 3 refused or a check
  failed (nothing changed).

WHAT IS INSTALLED
  C:\RPXperienceKiosk\app          the kiosk with its own Node.js, plus start-kiosk.cmd, kiosk-status.cmd,
                                   update.cmd, uninstall.cmd and export-data.cmd
  C:\RPXperienceKiosk\mysql        MySQL program files (only administrators can change them)
  C:\RPXperienceKiosk\mysql-data   the database (only the MySQL service and administrators can open it)
  C:\RPXperienceKiosk\data         the install record, logs and backups
  Windows service RPXKioskMySQL, with its own low rights account (when administrator rights were given)
  Wall PC only: a Startup shortcut, a desktop link to the admin page, and the firewall rule
  "RP Xperience Centre Kiosk - tablets to the kiosk server" (TCP 3000, Private and Domain networks only)
  Hibernate and wake timers are not set up by this package; they belong to the system level setup of the PC.

CHECKS AND LOGS
  checksums.sha256 lists every file of this package; install.cmd checks them before it changes anything.
  Every run writes a log to C:\RPXperienceKiosk\data\logs (before that folder exists: %TEMP%\rp-xperience-kiosk).
  No password or key is ever written to a log.
