export function keepListeningToEvents(): () => void {
    let intervalId:any = 0;
    const keepHopeAlive = () => {
        intervalId = setInterval(chrome.runtime.getPlatformInfo,  10_000);
    };
    chrome.runtime.onStartup.addListener(keepHopeAlive);
    keepHopeAlive();
    const stopListening = () => {
        clearInterval(intervalId);
        chrome.runtime.onStartup.removeListener(keepHopeAlive);
    };
    return stopListening;
}