import React, {useRef, useEffect} from 'react';

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

function AutoGrowingTextarea(props: Props) {
    const {value, onChange, style, ...rest} = props;
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto'; // Reset height
            textarea.style.height = textarea.scrollHeight + 'px'; // Set to content height
        }
    }, [value]);

    return (
        <textarea
            {...rest}
            ref={textareaRef}
            value={value}
            onChange={onChange}
            style={{
                overflow: 'hidden',
                resize: 'none',
                ...style,
            }}
        />
    );
}

export default AutoGrowingTextarea;
