import CreatableSelect from "react-select/creatable";
import {KeyboardEventHandler, useMemo, useState} from "react";

interface Option {
    readonly label: string;
    readonly value: string;
}


function createOption(string: string): Option {
    return {
        label: string,
        value: string
    }
}

export default function Multiselect(
    props: {
        items: string[],
        setItems: (items: string[]) => void
    }
) {
    const [inputValue, _setInputValue] = useState("")
    function setInputValue(str:string){
        str = str.replace(/[^a-zA-Z0-9-_]/g, "")
        _setInputValue(str)
    }
    const values: readonly Option[] = useMemo(() => {
        return props.items.map((s) => createOption(s))
    }, [props.items])
    const handleKeyDown: KeyboardEventHandler = (event) => {
        if (!inputValue) return;
        switch (event.key) {
            case 'Enter':
            case 'Tab':
            case ' ':
                props.setItems([...props.items, inputValue])
                setInputValue('');
                event.preventDefault();
        }
    };

    return <CreatableSelect
        // className="text-primary bg-base-content"
        theme={(theme) => {
            return {
                ...theme,
                colors: {
                    ...theme.colors,
                    danger: "oklch(var(--er))",
                    dangerLight: "oklch(var(--er) / 50%)",

                    neutral0: "oklch(var(--bc) / 0%)",
                    neutral5: "oklch(var(--bc) / 5%)",
                    neutral10: "oklch(var(--bc) / 10%)",
                    neutral20: "oklch(var(--bc) / 20%)",
                    neutral30: "oklch(var(--bc) / 30%)",
                    neutral40: "oklch(var(--bc) / 40%)",
                    neutral50: "oklch(var(--bc) / 50%)",
                    neutral60: "oklch(var(--bc) / 60%)",
                    neutral70: "oklch(var(--bc) / 70%)",
                    neutral80: "oklch(var(--bc) / 80%)",
                    neutral90: "oklch(var(--bc) / 90%)",

                    primary: "oklch(var(--p))",
                    primary75: "oklch(var(--p) / 75%)",
                    primary50: "oklch(var(--p) / 50%)",
                    primary25: "oklch(var(--p) / 25%)",
                }
            }
        }}
        components={
            {
                DropdownIndicator: null,
            }
        }
        inputValue={inputValue}
        onInputChange={(newValue) => setInputValue(newValue)}
        value={values}
        isMulti
        onChange={(newValue) => {
            props.setItems(newValue.map(i => i.value))
        }}
        onKeyDown={handleKeyDown}
        menuIsOpen={false}
    />
}