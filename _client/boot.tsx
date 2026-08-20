import { createRoot } from "react-dom/client";
import LabFirstGame from "./app/LabFirstGame.tsx";

const root = document.querySelector("#root");
if (!root) throw new Error("Golf IQ root element is missing.");
createRoot(root).render(<LabFirstGame />);
