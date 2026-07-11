interface ComboBoxProps {
    label: string;
    list: string[];
}

export function ComboBox({ label, list }: ComboBoxProps) {
    return (
        <div>
            <label htmlFor="cb1-input">{label}</label>
            <div className="combobox combobox-list">
                <div className="group">
                    <input id="cb1-input" className="cb_edit" type="text" role="combobox" aria-autocomplete="both" aria-expanded="false" aria-controls="cb1-listbox" />
                    <button type="button" id="cb1-button" aria-label="States" aria-expanded="false" aria-controls="cb1-listbox" tabIndex={-1}>
                        <svg width="18" height="16" aria-hidden="true" focusable="false" style={{ forcedColorAdjust: "auto" }}>
                            <polygon className="arrow" strokeWidth="0" fillOpacity="0.75" fill="currentcolor" points="3,6 15,6 9,14"></polygon>
                        </svg>
                    </button>
                </div>
                <ul id="cb1-listbox" role="listbox" aria-label="States">
                    {list.map((item, index) => (
                        <li key={index} id={`lb1-${item.toLowerCase().replace(/\s+/g, '-')}`} role="option">{item}</li>
                    ))}
                </ul>
            </div>
        </div>
    )
}