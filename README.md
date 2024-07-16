# AB Download Manager Browser Integration Repository

> If you look for main app repository use [This Link](https://github.com/amir1376/ab-download-manager)
## Usage

In order to use this extension you need to [install](https://abdownloadmanager.com/#download) AB Download Manager

### This extension does the fallowing

- Add a `Download With AB DM` in browser's Context menu
- Automatically captures download links when a users want to download a file from their browser

## How To Build
In order to build this extension locally
> I am developing this on `Windows` using `npm`, but it should have same result on other build environments
```bash
# setup dependencies
npm i

# for firefox
npm run pack:firefox
# for chrome
npm run pack:chrome
```

the output zip file will be placed under the `./dist/<browser_name>.zip` which contains the extension


## Repositories And Source Code

There are multiple repositories related to the **AB Download Manager** project

| Repository                                                                                                 | Description                                                                   |
|------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| [Main Application](https://github.com/amir1376/ab-download-manager)                                        | Contains the  **Application** that runs on your  **device**                   |
| [Browser Integration](https://github.com/amir1376/ab-download-manager-browser-integration)  (You are here) | Contains the **Browser Extension** to be installed on your  **browser**       |
| [Website](https://github.com/amir1376/ab-download-manager-website)                                         | Contains the **AB Download Manager** [website](https://abdownloadmanager.com) |

I spent a lot of time to create this project.

If you like my work, Please consider giving it a ⭐ Thanks ❤️
