import { ReactNode, useState } from "react";
import { EdittingContext } from "./EdittingContext";

export function EdittingProvider({ children }: { children: ReactNode }) {
    const [editingId, setEditingId] = useState<string | null>(null);

    return (
        <EdittingContext.Provider value={{ editingId, setEditingId }}>
            {children}
        </EdittingContext.Provider>
    );
}