import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  Download,
  Sparkles,
  Check,
  X,
  Copy,
  Upload,
  AlertCircle,
  FileText,
  Terminal,
  RefreshCw
} from "lucide-react";
import { ResearchProject, DataTable } from "../types";

interface DataTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ResearchProject;
  onUpdateProject: (updated: ResearchProject) => void;
}

export default function DataTableModal({ isOpen, onClose, project, onUpdateProject }: DataTableModalProps) {
  const [activeTab, setActiveTab] = useState<"list" | "create" | "import" | "ai">("list");
  
  // Create / Edit state
  const [editingTable, setEditingTable] = useState<DataTable | null>(null);
  const [tableName, setTableName] = useState("");
  const [tableDesc, setTableDesc] = useState("");
  const [headers, setHeaders] = useState<string[]>(["Factor", "Frequency (f)", "Percentage (%)"]);
  const [rows, setRows] = useState<string[][]>([
    ["Option A", "45", "37.5%"],
    ["Option B", "75", "62.5%"]
  ]);

  // Import state
  const [importName, setImportName] = useState("");
  const [importDesc, setImportDesc] = useState("");
  const [csvContent, setCsvContent] = useState("");

  // AI Prompt concept state
  const [aiConcept, setAiConcept] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  const handleCreateNewTableState = () => {
    setEditingTable(null);
    setTableName("New Quantitative Model");
    setTableDesc("Descriptive data table showing sample parameters.");
    setHeaders(["Factor", "Frequency (f)", "Percentage (%)"]);
    setRows([
      ["Group Alpha", "54", "45.0%"],
      ["Group Beta", "66", "55.0%"]
    ]);
    setActiveTab("create");
  };

  const handleEditExisting = (table: DataTable) => {
    setEditingTable(table);
    setTableName(table.name);
    setTableDesc(table.description);
    setHeaders([...table.headers]);
    setRows(table.rows.map(r => [...r]));
    setActiveTab("create");
  };

  const handleDeleteTable = async (tableId: string) => {
    if (!confirm("Are you sure you want to delete this table? This cannot be undone.")) return;
    
    try {
      const currentTables = project.dataTables || [];
      const updatedTables = currentTables.filter(t => t.id !== tableId);
      
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataTables: updatedTables
        })
      });

      if (!res.ok) throw new Error("Could not update data tables in project database.");

      onUpdateProject({
        ...project,
        dataTables: updatedTables
      });
      showNotification("success", "Table successfully deleted.");
    } catch (err: any) {
      showNotification("error", err.message || "Failed to delete table.");
    }
  };

  // Row and column editor functions
  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const updated = [...rows];
    updated[rowIndex][colIndex] = value;
    setRows(updated);
  };

  const handleHeaderChange = (colIndex: number, value: string) => {
    const updated = [...headers];
    updated[colIndex] = value;
    setHeaders(updated);
  };

  const addColumn = () => {
    setHeaders([...headers, `Column ${headers.length + 1}`]);
    setRows(rows.map(r => [...r, ""]));
  };

  const removeColumn = (colIndex: number) => {
    if (headers.length <= 1) return;
    setHeaders(headers.filter((_, i) => i !== colIndex));
    setRows(rows.map(r => r.filter((_, i) => i !== colIndex)));
  };

  const addRow = () => {
    const newRow = Array(headers.length).fill("");
    setRows([...rows, newRow]);
  };

  const removeRow = (rowIndex: number) => {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, i) => i !== rowIndex));
  };

  // CSV parsing & saving logic
  const parseCSV = (text: string): { headers: string[]; rows: string[][] } => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return { headers: [], rows: [] };
    
    const parseLine = (line: string) => {
      const parts: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      parts.push(current.trim());
      return parts;
    };

    const headers = parseLine(lines[0]);
    const rows = lines.slice(1).map(parseLine);
    return { headers, rows };
  };

  const serializeToCSV = (hdrs: string[], rws: string[][]): string => {
    const escapeCell = (val: string) => {
      const clean = (val || "").replace(/"/g, '""');
      if (clean.includes(",") || clean.includes("\n") || clean.includes('"')) {
        return `"${clean}"`;
      }
      return clean;
    };
    return [
      hdrs.map(escapeCell).join(","),
      ...rws.map(r => r.map(escapeCell).join(","))
    ].join("\n");
  };

  const handleImportCsvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importName.trim() || !csvContent.trim()) {
      showNotification("error", "Please specify a name and paste CSV content.");
      return;
    }

    try {
      const parsed = parseCSV(csvContent);
      if (parsed.headers.length === 0) {
        throw new Error("Unable to parse headers from the CSV content. Check your structure.");
      }

      const newTable: DataTable = {
        id: Math.random().toString(36).substring(2, 11),
        name: importName,
        description: importDesc || "Imported structured dataset.",
        headers: parsed.headers,
        rows: parsed.rows,
        createdAt: new Date().toISOString()
      };

      const currentTables = project.dataTables || [];
      const updatedTables = [...currentTables, newTable];

      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataTables: updatedTables
        })
      });

      if (!res.ok) throw new Error("Could not save imported table to project database.");

      onUpdateProject({
        ...project,
        dataTables: updatedTables
      });

      // reset import form
      setImportName("");
      setImportDesc("");
      setCsvContent("");
      showNotification("success", `Successfully imported "${newTable.name}" CSV!`);
      setActiveTab("list");
    } catch (err: any) {
      showNotification("error", err.message || "Failed to parse and import CSV file.");
    }
  };

  const handleSaveEditedTable = async () => {
    if (!tableName.trim()) {
      showNotification("error", "Table title is required.");
      return;
    }

    try {
      const currentTables = project.dataTables || [];
      
      let updatedTables: DataTable[];
      if (editingTable) {
        // Edit mode
        updatedTables = currentTables.map(t => {
          if (t.id === editingTable.id) {
            return {
              ...t,
              name: tableName,
              description: tableDesc,
              headers: [...headers],
              rows: rows.map(r => [...r])
            };
          }
          return t;
        });
      } else {
        // Create mode
        const newTable: DataTable = {
          id: Math.random().toString(36).substring(2, 11),
          name: tableName,
          description: tableDesc || "Manual research table matrices.",
          headers: [...headers],
          rows: rows.map(r => [...r]),
          createdAt: new Date().toISOString()
        };
        updatedTables = [...currentTables, newTable];
      }

      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataTables: updatedTables
        })
      });

      if (!res.ok) throw new Error("Could not persist data table state.");

      onUpdateProject({
        ...project,
        dataTables: updatedTables
      });

      showNotification("success", `Table "${tableName}" saved and synchronized!`);
      setActiveTab("list");
      setEditingTable(null);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to save table.");
    }
  };

  // AI Generation logic
  const handleAiTableGenerate = async (presetConcept?: string) => {
    const concept = presetConcept || aiConcept;
    if (!concept.trim()) {
      showNotification("error", "Please specify a concept or research focus for AI generation.");
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/data-table/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: project.title,
          field: project.field,
          methodology: project.methodology,
          sampleSize: project.sampleSize || "n=120 participants",
          tableConcept: concept
        })
      });

      if (!res.ok) throw new Error("AI generation server exception.");
      const data = await res.json();
      
      if (data.success && data.table) {
        const table = data.table;
        setTableName(table.name || "AI Generated Quantitative Matrix");
        setTableDesc(table.description || "Generated descriptive indicators.");
        setHeaders(table.headers || []);
        setRows(table.rows || []);
        
        showNotification("success", "AI model generated successfully! Loaded in editor stage.");
        setEditingTable(null);
        setActiveTab("create");
        setAiConcept(""); // clear prompt
      } else {
        throw new Error("Invalid output received from the biostatistics server node.");
      }
    } catch (err: any) {
      showNotification("error", err.message || "Model synthesis failed. Check your API parameters.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Exporters
  const downloadAsCSV = (table: DataTable) => {
    const csv = serializeToCSV(table.headers, table.rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${table.name.toLowerCase().replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyAsMarkdownTable = (table: DataTable) => {
    let md = `| ${table.headers.join(" | ")} |\n`;
    md += `| ${table.headers.map(() => "---").join(" | ")} |\n`;
    table.rows.forEach(r => {
      md += `| ${r.join(" | ")} |\n`;
    });

    navigator.clipboard.writeText(md);
    showNotification("success", "Copied fully-hydrated Markdown table code to clipboard!");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#09090b]/90 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-6xl w-full bg-[#0d0d10] border border-zinc-800 rounded-sm shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        id="data-tables-modal-body"
      >
        {/* Modal Header */}
        <div className="border-b border-zinc-850 p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-lg font-medium text-white tracking-wide">
                Chapter 4 Quantitative Research & Data Table Manager
              </h2>
              <p className="text-[11px] text-zinc-450 mt-0.5">
                Active Project Registry: <span className="text-zinc-300 italic font-serif">"{project.title}"</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-450 hover:text-white transition duration-150 p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs Menu */}
        <div className="bg-[#09090b]/60 border-b border-zinc-850 px-5 py-2.5 flex items-center justify-between">
          <div className="flex items-center space-x-1 font-mono text-[10px]">
            <button
              onClick={() => { setActiveTab("list"); setEditingTable(null); }}
              className={`px-3 py-1.5 uppercase font-medium border rounded-sm transition cursor-pointer ${
                activeTab === "list" ? "bg-zinc-850 text-white border-zinc-700" : "text-zinc-450 border-transparent hover:text-zinc-200"
              }`}
            >
              Saved Datasets ({project.dataTables?.length || 0})
            </button>
            <button
              onClick={handleCreateNewTableState}
              className={`px-3 py-1.5 uppercase font-medium border rounded-sm transition cursor-pointer flex items-center space-x-1 ${
                activeTab === "create" ? "bg-zinc-850 text-white border-zinc-700" : "text-zinc-450 border-transparent hover:text-zinc-200"
              }`}
            >
              <Plus className="w-3 h-3" />
              <span>{editingTable ? "Active Editor Stage" : "Design Table"}</span>
            </button>
            <button
              onClick={() => { setActiveTab("import"); setEditingTable(null); }}
              className={`px-3 py-1.5 uppercase font-medium border rounded-sm transition cursor-pointer flex items-center space-x-1 ${
                activeTab === "import" ? "bg-zinc-850 text-white border-zinc-700" : "text-zinc-450 border-transparent hover:text-zinc-200"
              }`}
            >
              <Upload className="w-3 h-3" />
              <span>Import Dataset</span>
            </button>
            <button
              onClick={() => { setActiveTab("ai"); setEditingTable(null); }}
              className={`px-3 py-1.5 uppercase font-medium border rounded-sm transition cursor-pointer flex items-center space-x-1 ${
                activeTab === "ai" ? "bg-emerald-950/40 text-emerald-350 border-emerald-900/40" : "text-zinc-450 border-transparent hover:text-zinc-200"
              }`}
            >
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>AI Synthesizer</span>
            </button>
          </div>
          <span className="text-[10px] uppercase font-mono tracking-widest text-[#10b981] bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20 rounded">
            Validated Status: Active
          </span>
        </div>

        {/* Modal Alerts */}
        {notification && (
          <div className={`p-3 text-xs font-mono flex items-center space-x-2 border-b ${
            notification.type === "success" 
              ? "bg-emerald-950/20 text-emerald-300 border-emerald-900/30" 
              : "bg-red-950/20 text-red-300 border-red-900/30"
          }`}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{notification.text}</span>
          </div>
        )}

        {/* Modal Client Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          
          {/* TAB 1: LIST / INVENTORY */}
          {activeTab === "list" && (
            <div className="space-y-4 animate-fade-in">
              {(!project.dataTables || project.dataTables.length === 0) ? (
                <div className="text-center py-16 border border-zinc-850 bg-zinc-950/30 rounded-sm">
                  <FileSpreadsheet className="w-10 h-10 text-zinc-650 mx-auto mb-3" />
                  <h4 className="text-sm font-medium text-white tracking-wide">No Data Tables Loaded</h4>
                  <p className="text-xs text-zinc-450 mt-1 max-w-sm mx-auto leading-relaxed">
                    Generate descriptive demographic tables or complex multi-variable statistic models via AI Synthesizer or manual builder.
                  </p>
                  <div className="mt-5 flex justify-center space-x-3">
                    <button
                      onClick={() => { setActiveTab("ai"); }}
                      className="px-4 py-2 bg-emerald-950 text-emerald-450 hover:bg-emerald-900/50 border border-emerald-800/40 text-xs font-mono uppercase font-bold tracking-wider rounded-sm cursor-pointer flex items-center space-x-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Synthesize with AI</span>
                    </button>
                    <button
                      onClick={handleCreateNewTableState}
                      className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-mono uppercase font-bold tracking-wider rounded-sm cursor-pointer flex items-center space-x-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Manual Builder</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {project.dataTables.map((table) => (
                    <div 
                      key={table.id}
                      className="border border-zinc-850 p-4 bg-zinc-950/20 hover:border-zinc-750 transition duration-150 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-2">
                            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                            <h4 className="text-sm font-medium text-zinc-200 tracking-wide line-clamp-1">
                              {table.name}
                            </h4>
                          </div>
                          <span className="text-[8.5px] font-mono text-zinc-550 border border-zinc-850 px-1.5 py-0.5 rounded-sm">
                            {table.rows.length} rows × {table.headers.length} cols
                          </span>
                        </div>
                        <p className="text-xs text-zinc-450 mt-1 line-clamp-2 leading-relaxed">
                          {table.description}
                        </p>

                        {/* Table Small Preview Container */}
                        <div className="mt-3 overflow-x-auto max-h-32 border border-zinc-900 bg-zinc-950/40 text-[9px] font-mono rounded-sm">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-zinc-900/60 border-b border-zinc-850 text-zinc-400">
                                {table.headers.slice(0, 3).map((h, i) => (
                                  <th key={i} className="py-1 px-1.5 font-bold truncate max-w-[110px]">{h}</th>
                                ))}
                                {table.headers.length > 3 && <th className="py-1 px-1.5 text-zinc-550 italic">+{table.headers.length - 3}</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {table.rows.slice(0, 3).map((row, rIdx) => (
                                <tr key={rIdx} className="border-b border-zinc-900/40 hover:bg-zinc-900/20 text-zinc-350">
                                  {row.slice(0, 3).map((cell, cIdx) => (
                                    <td key={cIdx} className="py-0.5 px-1.5 truncate max-w-[110px]">{cell}</td>
                                  ))}
                                  {table.headers.length > 3 && <td className="py-0.5 px-1.5 text-zinc-650 italic">...</td>}
                                </tr>
                              ))}
                              {table.rows.length > 3 && (
                                <tr>
                                  <td colSpan={4} className="py-0.5 px-1.5 text-zinc-550 text-[8px] italic text-center">
                                    And {table.rows.length - 3} additional respondents metrics...
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Controls Box */}
                      <div className="mt-4 pt-3 border-t border-zinc-900 flex justify-between items-center font-mono text-[9px] uppercase font-bold">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditExisting(table)}
                            className="px-2 py-1 border border-zinc-850 text-zinc-400 hover:text-white hover:border-zinc-700 cursor-pointer"
                          >
                            Edit Cells
                          </button>
                          <button
                            onClick={() => copyAsMarkdownTable(table)}
                            className="px-2 py-1 border border-zinc-850 text-zinc-400 hover:text-white hover:border-zinc-700 cursor-pointer flex items-center space-x-1"
                          >
                            <Copy className="w-2.5 h-2.5" />
                            <span>Copy Markdown</span>
                          </button>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => downloadAsCSV(table)}
                            className="p-1 border border-zinc-850 text-zinc-450 hover:text-white cursor-pointer"
                            title="Download CSV file"
                          >
                            <Download className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteTable(table.id)}
                            className="p-1 border border-zinc-850/40 hover:border-red-900 text-red-400 cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MANUAL CREATE OR EDIT */}
          {activeTab === "create" && (
            <div className="space-y-4 animate-fade-in font-sans">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-zinc-450">
                    Table Matrix Title
                  </label>
                  <input
                    type="text"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-white focus:outline-none focus:border-zinc-700"
                    placeholder="e.g. Table 4.1 Respondent Gender Demographics"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-zinc-450">
                    Active Editor Schema
                  </label>
                  <div className="px-3 py-2 bg-zinc-950 border border-zinc-900 text-[10px] font-mono text-zinc-400 flex items-center justify-between rounded min-h-[38px]">
                    <span>Headers Count: {headers.length}</span>
                    <span>Rows Count: {rows.length}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-zinc-450">
                  Qualitative/Quantitative Descriptive Annotation
                </label>
                <textarea
                  value={tableDesc}
                  onChange={(e) => setTableDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs text-white focus:outline-none focus:border-zinc-700 h-16 resize-none"
                  placeholder="Focuses on structural distribution of active sample nodes..."
                />
              </div>

              {/* SpreadSheet Grid Controller */}
              <div className="space-y-3.5 border border-zinc-850 p-4 bg-zinc-950/40 rounded-sm">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                    Interactive Data Matrix Stage
                  </h4>
                  <div className="flex space-x-2 font-mono text-[9px] uppercase font-bold">
                    <button
                      onClick={addColumn}
                      type="button"
                      className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-350 cursor-pointer"
                    >
                      + Add Column
                    </button>
                    <button
                      onClick={addRow}
                      type="button"
                      className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-350 cursor-pointer"
                    >
                      + Add Row
                    </button>
                  </div>
                </div>

                {/* SPREADSHEET SCROLL CONTAINER */}
                <div className="overflow-x-auto border border-zinc-900 rounded bg-zinc-950">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-450 font-mono text-[10px]">
                        {headers.map((hdr, colIdx) => (
                          <th key={colIdx} className="p-2 min-w-[120px] text-left">
                            <div className="flex items-center space-x-1.5">
                              <input
                                type="text"
                                value={hdr}
                                onChange={(e) => handleHeaderChange(colIdx, e.target.value)}
                                className="bg-transparent text-white font-semibold focus:outline-none focus:bg-zinc-800 px-1 rounded w-full border border-transparent border-dashed hover:border-zinc-700"
                              />
                              <button
                                onClick={() => removeColumn(colIdx)}
                                className="text-zinc-650 hover:text-red-400 p-0.5 cursor-pointer"
                                title="Delete Column"
                                type="button"
                                disabled={headers.length <= 1}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </th>
                        ))}
                        <th className="p-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, rIdx) => (
                        <tr key={rIdx} className="border-b border-zinc-900 hover:bg-zinc-900/20 text-xs">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="p-1">
                              <input
                                type="text"
                                value={cell}
                                onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                                className="w-full bg-transparent px-1.5 py-1 text-zinc-300 focus:bg-zinc-900 text-xs focus:outline-none focus:text-white rounded border border-transparent border-solid focus:border-zinc-805"
                              />
                            </td>
                          ))}
                          <td className="p-1.5 w-10 text-center">
                            <button
                              onClick={() => removeRow(rIdx)}
                              className="text-zinc-650 hover:text-red-400 cursor-pointer"
                              title="Delete Row"
                              type="button"
                              disabled={rows.length <= 1}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="border-t border-zinc-850 pt-4 flex justify-between font-mono text-[10px] uppercase font-bold">
                <button
                  onClick={() => setActiveTab("list")}
                  className="px-3 py-2 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEditedTable}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-650 to-teal-650 text-white rounded cursor-pointer"
                >
                  {editingTable ? "Update & Save Table" : "Register Table Dataset"}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: IMPORT DATA */}
          {activeTab === "import" && (
            <form onSubmit={handleImportCsvSubmit} className="space-y-4 animate-fade-in font-sans">
              <div className="p-4 bg-zinc-950/40 border border-zinc-850 space-y-4 rounded-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-zinc-450">
                      Table Matrix Name
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs text-white focus:outline-none focus:border-zinc-700"
                      value={importName}
                      onChange={(e) => setImportName(e.target.value)}
                      placeholder="e.g. Statistical Respondent Spread"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-zinc-450">
                      Methodology Type
                    </label>
                    <div className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 font-mono">
                      Current Focus: {project.methodology}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-zinc-450">
                    Brief Dataset Description
                  </label>
                  <textarea
                    className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-white focus:outline-none focus:border-zinc-700 h-14 resize-none"
                    value={importDesc}
                    onChange={(e) => setImportDesc(e.target.value)}
                    placeholder="Describe how these quantitative matrices were gathered and filtered..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-zinc-450 flex items-center justify-between">
                    <span>Raw CSV Characters (UTF-8 formatted string)</span>
                    <span className="text-[8.5px] italic text-zinc-550 lowercase font-light">headers in first row</span>
                  </label>
                  <textarea
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-850 font-mono text-[10px] leading-relaxed text-zinc-300 focus:outline-none focus:border-zinc-700 h-44 rounded-sm resize-y"
                    value={csvContent}
                    onChange={(e) => setCsvContent(e.target.value)}
                    placeholder={`Factor,Frequency (f),Percentage (%)\nMale,54,45.0%\nFemale,66,55.0%`}
                    required
                  />
                </div>
              </div>

              <div className="flex justify-between font-mono text-[10px] uppercase font-bold">
                <button
                  type="button"
                  onClick={() => setActiveTab("list")}
                  className="px-3 py-2 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 text-white rounded cursor-pointer"
                >
                  Parse & Synchronize CSV
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: AI GENERATOR */}
          {activeTab === "ai" && (
            <div className="space-y-4 animate-fade-in font-sans">
              
              {/* Introduction Banner */}
              <div className="p-4 bg-emerald-950/15 border border-emerald-900/30 text-xs flex items-start space-x-3 rounded-sm leading-relaxed">
                <div className="p-1 rounded bg-emerald-900/30 text-emerald-400 mt-0.5 shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-white tracking-wide mb-1">
                    Biostatistics & Research Variable Matrix Synthesizer
                  </h4>
                  <p className="text-zinc-[350]">
                    AXOM OS integrates dynamic Gemini models to construct fully-populated data arrays compliant with your methodology strategy: <span className="font-mono text-emerald-400 font-bold uppercase">{project.methodology}</span> and active sample sizing: <span className="font-mono text-emerald-400 font-bold uppercase">{project.sampleSize || "n=120 cohorts"}</span>. Choose a pre-configured template below or specify a custom table topic.
                  </p>
                </div>
              </div>

              {/* Recommended Presets Box */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-zinc-850 p-4 bg-zinc-950/40 relative hover:border-zinc-750 transition flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-mono font-bold text-zinc-350 uppercase">Respondent Demographic Profile</h4>
                    <p className="text-[11px] text-zinc-450 mt-1.5 leading-relaxed">
                      Generates demographic parameters such as Age, Gender, Education levels, frequencies, and percentages aligned with your sample size of {project.sampleSize || "120"}.
                    </p>
                  </div>
                  <button
                    onClick={() => handleAiTableGenerate("Respondent Demographic Distribution Profile")}
                    disabled={isGenerating}
                    className="mt-4 px-3 py-1.5 bg-zinc-905 hover:bg-zinc-850 text-zinc-200 border border-zinc-800 font-mono text-[9px] uppercase font-bold tracking-wider rounded-sm cursor-pointer self-start"
                  >
                    Generate Demographic Preset
                  </button>
                </div>

                <div className="border border-zinc-850 p-4 bg-zinc-950/40 relative hover:border-zinc-750 transition flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-mono font-bold text-zinc-350 uppercase">Multiple Linear Regression Analysis</h4>
                    <p className="text-[11px] text-zinc-450 mt-1.5 leading-relaxed">
                      Generates critical statistic coefficients (Beta, Standard Error, t-values, p-values) to map core hypothesis dependencies for Chapter 4 discussion.
                    </p>
                  </div>
                  <button
                    onClick={() => handleAiTableGenerate("Multiple Linear Regression coefficients model showing Standard Errors and P-values")}
                    disabled={isGenerating}
                    className="mt-4 px-3 py-1.5 bg-zinc-905 hover:bg-zinc-850 text-zinc-200 border border-zinc-800 font-mono text-[9px] uppercase font-bold tracking-wider rounded-sm cursor-pointer self-start"
                  >
                    Generate Regression Matrix
                  </button>
                </div>

                <div className="border border-zinc-850 p-4 bg-zinc-950/40 relative hover:border-zinc-750 transition flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-mono font-bold text-zinc-350 uppercase">Correlation Correlation Array</h4>
                    <p className="text-[11px] text-zinc-450 mt-1.5 leading-relaxed">
                      Constructs Pearson Correlation r coefficients matrix demonstrating relationships between study variables with p-value significance markers.
                    </p>
                  </div>
                  <button
                    onClick={() => handleAiTableGenerate("Pearson correlation coefficients table showing relationships between independent and dependent variables")}
                    disabled={isGenerating}
                    className="mt-4 px-3 py-1.5 bg-zinc-905 hover:bg-zinc-850 text-zinc-200 border border-zinc-800 font-mono text-[9px] uppercase font-bold tracking-wider rounded-sm cursor-pointer self-start"
                  >
                    Generate Correlation Matrix
                  </button>
                </div>

                <div className="border border-zinc-850 p-4 bg-zinc-950/40 relative hover:border-zinc-750 transition flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-mono font-bold text-zinc-350 uppercase">Thematic Qualitative Coding</h4>
                    <p className="text-[11px] text-zinc-450 mt-1.5 leading-relaxed">
                      Formats descriptive themes, subthemes, recurrence frequency, and respondent quote tokens to satisfy Qualitative or Mixed Methods study requirements.
                    </p>
                  </div>
                  <button
                    onClick={() => handleAiTableGenerate("Qualitative thematic coding showing major themes, subthemes, frequency count, and brief respondent statement tokens")}
                    disabled={isGenerating}
                    className="mt-4 px-3 py-1.5 bg-zinc-905 hover:bg-zinc-850 text-zinc-200 border border-zinc-800 font-mono text-[9px] uppercase font-bold tracking-wider rounded-sm cursor-pointer self-start"
                  >
                    Generate Coding Preset
                  </button>
                </div>
              </div>

              {/* Custom Concept Builder input */}
              <div className="border border-zinc-850 p-4 bg-[#0a0a0c] space-y-4 rounded-sm">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-zinc-450">
                    Custom Variable Table Topic Concept
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs text-white focus:outline-none focus:border-zinc-700 font-sans"
                      placeholder="e.g. Cronbach's Alpha Reliability values or Descriptive Analysis of Likert Scale items"
                      value={aiConcept}
                      onChange={(e) => setAiConcept(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleAiTableGenerate();
                        }
                      }}
                      disabled={isGenerating}
                    />
                    <button
                      type="button"
                      onClick={() => handleAiTableGenerate()}
                      disabled={isGenerating}
                      className="px-4 py-2 bg-[#10b981] hover:bg-emerald-500 text-black font-semibold text-xs rounded transition uppercase tracking-wider font-mono cursor-pointer flex items-center space-x-1 shrink-0"
                    >
                      {isGenerating ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Synthesizing...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Generate Table</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-zinc-850 p-4 bg-[#09090b]/80 flex justify-between font-mono text-[10px] font-bold text-zinc-550">
          <span>AXOM QUANT DATA ENGINE • STANDALONE MODULAR INSTANCE</span>
          <span>STABLE RUNTIME</span>
        </div>
      </motion.div>
    </div>
  );
}
