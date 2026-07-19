import * as zod from "zod"

// prevent Content-Security-Policy: eval warning
zod.config({
    jitless: true,
});

export {
    zod as z
}
