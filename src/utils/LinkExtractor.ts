import {DownloadRequestItem} from "~/interfaces/DownloadRequestItem";

export function getLinksFromSelection(selection:Selection): Array<DownloadRequestItem> {
    const items: Set<DownloadRequestItem> = new Set()
    const downloadPage = document.location.href
    for (let i = 0; i < selection.rangeCount; i++) {
        const node = selection.getRangeAt(i).commonAncestorContainer
        if (!isElementNode(node)) {
            continue
        }
        for (const linkNode of node.querySelectorAll("a")){
            if (!selection.containsNode(linkNode,true)){
                continue
            }
            if (!linkNode.href){
                continue
            }
            if (linkNode.href) {
                items.add({
                    link: linkNode.href,
                    headers: null,
                    description: linkNode.innerText,
                    downloadPage: downloadPage
                })
            }
        }
    }
    return [...items]
}

function isElementNode(node: Node): node is Element {
    return node.nodeType === Node.ELEMENT_NODE
}
