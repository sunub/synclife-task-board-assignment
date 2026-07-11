import { createContext, useContext } from "react";

export interface EdittingContextType {
    editingId: string | null;
    setEditingId: (id: string | null) => void;
}

export const EdittingContext = createContext<EdittingContextType>({
    editingId: null,
    setEditingId: () => { },
});

export const useEdittingContext = () => {
    const context = useContext(EdittingContext);
    if (!context) {
        throw new Error("useEdittingContext must be used within a EdittingProvider");
    }
    return context;
}