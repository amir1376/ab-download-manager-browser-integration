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
# for firefox
npm run pack:firefox
# for chrome
npm run pack:chrome
```

the output zip file will be placed under the `./dist/<browser_name>.zip` which contains the extension
