import {BackendApi, createBackendApi} from "~/backend/BackendApi";
import {run} from "~/utils/ScopeFunctions";
import * as Configs from "~/configs/Config"
import {DownloadRequestItem} from "~/interfaces/DownloadRequestItem";
import {DownloadRequestOptions, isDownloadRequestOptionsNecessary} from "~/interfaces/DownloadRequestOptions";

let api :BackendApi|null= null

async function getApi(){
    if (api===null){
        const config=Configs.getLatestConfig()
        api=createBackendApi(config.port)
    }
    return api
}

Configs.onChanged.addEventListener((event)=>{
    run(async ()=>{
        const port =(event.port)
        api=createBackendApi(port)
    })
})

export async function addDownload(
    downloadRequestItems: DownloadRequestItem[],
    downloadRequestOptions: DownloadRequestOptions,
) {
    const api = await getApi();
    if (isDownloadRequestOptionsNecessary(downloadRequestOptions)) {
        return await api.addDownload({
            items: downloadRequestItems,
            options: downloadRequestOptions,
        })
    } else {
        return await api.addDownloadLegacy(downloadRequestItems)
    }
}

export async function ping(port:number|null = null) {
    let api:BackendApi
    if (port!==null){
        api=createBackendApi(port)
    }else {
        api=await getApi()
    }
    try {
        await api.ping()
        return true
    }catch (e){
        return false
    }
}


