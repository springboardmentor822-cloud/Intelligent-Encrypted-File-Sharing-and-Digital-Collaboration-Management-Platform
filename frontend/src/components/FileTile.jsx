import { C } from "../lib/theme";
import { File, FileImage, FileSpreadsheet, FileText, FileVideo, Presentation } from "lucide-react";

const TYPE_STYLE = {
  image: ["bg-violet-100 text-violet-600", FileImage], pdf: ["bg-red-100 text-red-600", FileText],
  document: ["bg-blue-100 text-blue-600", FileText], spreadsheet: ["bg-emerald-100 text-emerald-600", FileSpreadsheet],
  presentation: ["bg-orange-100 text-orange-600", Presentation], video: ["bg-rose-100 text-rose-600", FileVideo], text: ["bg-slate-100 text-slate-600", FileText],
};

// Colours used for each file type / group in charts (same colours everywhere in the app)
export const TYPE_COLOR = {
  pdf: "#e5484d", get document() { return C.primary; }, spreadsheet: "#10b981", presentation: "#f59e0b",
  text: "#64748b", image: "#06b6d4", video: "#f0506e", other: "#8b5cf6",
};
export const TYPE_LABEL = {
  pdf: "PDF", document: "Word", spreadsheet: "Spreadsheets", presentation: "Presentations",
  text: "Text", image: "Images", video: "Videos", other: "Other",
};
// The four groups of the analytics charts (Documents / Images / Videos / Others), as in the mockup
export const GROUP_COLOR = { get documents() { return C.primary; }, images: "#10b981", videos: "#f0506e", others: "#8b5cf6" };
export const GROUP_LABEL = { documents: "Documents", images: "Images", videos: "Videos", others: "Others" };

export default function FileTile({ category, size = 40 }) {
  const [cls, Icon] = TYPE_STYLE[category] || ["bg-slate-100 text-slate-600", File];
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-xl ${cls}`} style={{ width: size, height: size }}>
      <Icon size={size * 0.5} />
    </span>
  );
}
