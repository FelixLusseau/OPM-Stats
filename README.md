# OPM Stats

<img src="OPM-Stats.png" alt="Fire punch logo" width="150" height="150"/> <br>

[![Author](https://img.shields.io/badge/author-@FelixLusseau-blue)](https://github.com/FelixLusseau)
![version](https://img.shields.io/github/package-json/v/FelixLusseau/OPM-Bot)
[![CodeQL](https://github.com/FelixLusseau/OPM-Bot/actions/workflows/codeql.yml/badge.svg)](https://github.com/FelixLusseau/OPM-Bot/actions/workflows/codeql.yml)

[![GitHub latest commit](https://img.shields.io/github/last-commit/FelixLusseau/OPM-Bot)](https://gitHub.com/FelixLusseau/OPM-Bot/commit/)
[![Maintenance](https://img.shields.io/badge/maintained%3F-yes-green.svg)](https://GitHub.com/FelixLusseau/OPM-Bot/graphs/commit-activity)

![Discord](https://img.shields.io/badge/Discord-%235865F2.svg?style=for-the-badge&logo=discord&logoColor=white)
![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![SQLite](https://img.shields.io/badge/sqlite-%2307405e.svg?style=for-the-badge&logo=sqlite&logoColor=white)

<br>

### A Discord bot to manage the Clash Royale clans and clan wars of the One Punch Man Family.

<br>

## Features

- Commands list :
  - `/ffhelp` : Shows the help menu
  - `/ffattacks` : Shows the remaining attacks of the day and can ping remaining players
  - `/ffavg` : Shows the average war points of the players sending an Excel spreadsheet and the associated png
  - `/ffclanreg` : Manage the clans for the server's commands
  - `/ffhour` : Manage the hours of the daily reports and resets
  - `/ffgetrotates` : Shows the rotations of the players between the clans
  - `/ffmembers` : Shows the members of the clan
  - `/ffopponents` : Shows information about the war opponents and their Colosseum history the last 3 seasons
  - `/ffplayer` : Shows the player's profile
  - `/ffrace` : Shows the current war day status (or Colosseum)
  - `/ffresults` : Shows the points of all the war participants
  - `/ffriver` : Shows the current river race (or Colosseum)
  - `/ffreport` : Shows the war report
  - `/ffrmrotate` : Removes an entry from the rotations
  - `/ffsetrotates` : Sets the rotations of the players between the clans
  - `/fftag` : Shows the information of a not registered clan
  - `/fftournament` : Shows information about a tournament

- Scheduled war report has been added to the bot ! It will be sent every day from friday to monday at the reset hour in the clan war channel.
- Scheduled `/ffrace` and `/ffattacks` with ping has been added to the bot ! It will be sent every day from friday to monday at 09h00 and from Thurday to Sunday at 21h00 in the clan war channels.

- Responds a link to the RoyaleAPI player profile when a player tag is sent in a room where the bot is present or when the DeckShop bot declares that a **new** player has joined after having checked on the 2 last seasons' players.
  Sends a screenshot of the player war history and the graph associated.

- Send an Excel spreadsheet with the war results and averages with colors.

- 31/08/2023 : New display is beginning its deployment !
Old version is still available with the option `text_version: True`.

- 15/01/2024 : The bot is now able to be used on multiple servers at the same time !

- 07/02/2024 : New display v2 !

- 23/03/2025 : Added the Family averages calculation.

- The bot now supports Hour change due to Daylight Saving Time for end of war day reports.

- 10/11/2025 : Added Docker Image on GHCR.

- 18/01/2026 : Added `/fftournament` command to show tournament information.