import React, { useState, useRef, useEffect } from "react";
import { 
  Upload, 
  Image as ImageIcon, 
  Copy, 
  Check, 
  RefreshCw, 
  Trash2, 
  Eye, 
  Sparkles, 
  Info, 
  AlertCircle, 
  FileText, 
  ChevronRight, 
  ArrowRight,
  Shield,
  Search,
  Sun,
  Moon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AnalysisResponse, HistoryItem } from "./types";

const LOADING_MESSAGES = [
  "Iniciando leitura semântica da cena...",
  "Escaneando sujeitos, pessoas, animais e objetos...",
  "Analisando características visuais, cores e texturas...",
  "Observando ações e expressões corporais...",
  "Identificando o ambiente e relações espaciais...",
  "Sintetizando detalhes para inteligências generativas...",
  "Polindo riqueza semântica para descrição final..."
];

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("visionreader_theme");
      return saved === "dark";
    } catch (e) {
      return false;
    }
  });

  const [image, setImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [description, setDescription] = useState<string | null>(null);
  const [descriptionEn, setDescriptionEn] = useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<"pt" | "en">("pt");
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedEn, setCopiedEn] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Toggle do tema claro/escuro
  const toggleTheme = () => {
    setIsDark((prev) => {
      const newVal = !prev;
      try {
        localStorage.setItem("visionreader_theme", newVal ? "dark" : "light");
      } catch (e) {}
      return newVal;
    });
  };

  // Sincronizar classe dark no documentElement
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  // Inicializar o histórico a partir do localStorage
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem("visionreader_history_v2");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Salvar no localStorage sempre que o histórico mudar
  useEffect(() => {
    try {
      localStorage.setItem("visionreader_history_v2", JSON.stringify(history));
    } catch (e) {
      console.error("Erro ao salvar histórico:", e);
    }
  }, [history]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rotacionar as mensagens de carregamento de forma agradável
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      interval = setInterval(() => {
        setLoadingMsgIdx((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 1600);
    } else {
      setLoadingMsgIdx(0);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Formatar bytes em formato amigável (MB)
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = 2;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  // Processamento do arquivo de imagem selecionado
  const handleFile = (file: File) => {
    setError(null);
    setDescription(null);

    // Validações
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Formato de arquivo não suportado. Por favor, envie JPG, PNG ou WEBP.");
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setError("A imagem ultrapassa o limite de 10MB permitido.");
      return;
    }

    setFileName(file.name);
    setFileSize(formatBytes(file.size));
    setMimeType(file.type);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImage(reader.result);
        // Após carregar a imagem com sucesso, inicia automaticamente a análise semântica
        analyzeImage(reader.result, file.type, file.name, formatBytes(file.size));
      }
    };
    reader.onerror = () => {
      setError("Ocorreu um erro ao carregar o arquivo da imagem.");
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  // Envia a imagem em base64 para o servidor para análise com o Gemini
  const analyzeImage = async (
    base64String: string, 
    typeStr: string, 
    customFileName?: string,
    customFileSize?: string
  ) => {
    setIsLoading(true);
    setError(null);
    
    const finalFileName = customFileName || fileName || "imagem_analisada.png";
    const finalFileSize = customFileSize || fileSize || "Desconhecido";

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: base64String,
          mimeType: typeStr,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Ocorreu um erro inesperado no processamento da imagem.");
      }

      const data: AnalysisResponse = await response.json();
      setDescription(data.description);
      setDescriptionEn(data.description_en || null);
      setCreatedAt(data.created_at);

      // Adiciona esta análise de forma persistente ao histórico (limite de 5 itens)
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        image: base64String,
        fileName: finalFileName,
        fileSize: finalFileSize,
        mimeType: typeStr,
        description: data.description,
        description_en: data.description_en,
        created_at: data.created_at,
      };

      setHistory((prev) => {
        // Evita duplicar a mesma imagem exata para manter o histórico interessante e útil
        const filtered = prev.filter((item) => item.image !== base64String);
        return [newItem, ...filtered].slice(0, 5);
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro de conexão com o servidor de análise.");
    } finally {
      setIsLoading(false);
    }
  };

  // Selecionar um item do histórico para visualização/reuso rápido
  const handleSelectHistoryItem = (item: HistoryItem) => {
    setImage(item.image);
    setFileName(item.fileName);
    setFileSize(item.fileSize);
    setMimeType(item.mimeType);
    setDescription(item.description);
    setDescriptionEn(item.description_en || null);
    setCreatedAt(item.created_at);
    setError(null);
  };

  // Excluir um único item do histórico
  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Impede focar o item ao clicar no ícone de remoção
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  // Limpar todo o histórico de análises
  const handleClearHistory = () => {
    setHistory([]);
  };

  // Copiar descrição gerada para a área de transferência
  const handleCopy = () => {
    if (description) {
      navigator.clipboard.writeText(description);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Copiar versão em inglês para a área de transferência
  const handleCopyEn = () => {
    if (descriptionEn) {
      navigator.clipboard.writeText(descriptionEn);
      setCopiedEn(true);
      setTimeout(() => setCopiedEn(false), 2000);
    }
  };

  // Traduzir descrição em português brasileiro para inglês (no caso de itens de histórico legados ou falha de rede)
  const handleTranslateToEnglish = async () => {
    if (!description) return;
    setIsTranslating(true);
    setError(null);
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: description }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro de conexão ao traduzir o texto.");
      }

      const data = await response.json();
      const translation = data.translation;
      setDescriptionEn(translation);

      // Atualiza também no histórico local para persistência rápida
      setHistory((prev) => 
        prev.map((item) => {
          if (item.description === description) {
            return { ...item, description_en: translation };
          }
          return item;
        })
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Não foi possível traduzir a descrição do português.");
    } finally {
      setIsTranslating(false);
    }
  };

  // Resetar estados para nova análise
  const handleClear = () => {
    setImage(null);
    setMimeType(null);
    setFileName(null);
    setFileSize(null);
    setDescription(null);
    setDescriptionEn(null);
    setActiveLanguage("pt");
    setCreatedAt(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Regenerar análise da imagem atual
  const handleRegenerate = () => {
    if (image && mimeType) {
      analyzeImage(image, mimeType);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-800"}`}>
      
      {/* Topo / Header */}
      <header className={`sticky top-0 z-10 border-b transition-all duration-200 ${isDark ? "bg-slate-900/95 border-slate-800/80 text-white" : "bg-white/80 border-slate-100/70 text-slate-900"} backdrop-blur-md px-6 py-4`} id="header_section">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl shadow-sm flex items-center justify-center transition-all duration-200 hover:scale-[1.03] ${isDark ? "bg-slate-800" : "bg-slate-900 text-white"}`}>
              <Eye className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`font-display text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                  VisionReader <span className={`font-medium font-mono text-sm uppercase px-1.5 py-0.5 rounded border ${isDark ? "bg-emerald-950/40 border-emerald-900/60 text-emerald-400" : "bg-emerald-50 border-emerald-100 text-emerald-500"}`}>AI</span>
                </h1>
              </div>
              <p className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-505"}`}>Interpretador semântico de percepção visual</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Seletor de Tema (Claro/Escuro) */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-xl border transition-all duration-200 active:scale-95 flex items-center justify-center ${
                isDark 
                  ? "bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700 hover:text-amber-300" 
                  : "bg-slate-100/50 border-slate-205 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              }`}
              title={isDark ? "Ativar Modo Claro" : "Ativar Modo Escuro"}
              aria-label="Alternar tema"
              id="theme_toggle_btn"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Badge de Versão */}
            <div className={`flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full shadow-inner ${isDark ? "text-slate-300 bg-slate-800/50 border border-slate-700/60" : "text-slate-400 bg-slate-50 border border-slate-100"}`}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              PROTÓTIPO MVP
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-8">
        
        {/* Core Workspace Layout: Bento-like grid system */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Esquerda: Upload e Configurações de Imagem (5 colunas no desktop) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* Bloco de Upload */}
            <div className={`border rounded-2xl p-6 shadow-sm flex flex-col gap-5 ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200/80"}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold tracking-tight flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-900"}`}>
                  <ImageIcon className="w-4 h-4 text-slate-500" />
                  Imagem de Origem
                </span>
                {image && (
                  <span className="text-xs text-slate-400 font-mono">
                    {fileSize}
                  </span>
                )}
              </div>

              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".png,.jpg,.jpeg,.webp" 
                className="hidden" 
              />

              {/* Botão Dropzone ou Preview */}
              <AnimatePresence mode="wait">
                {!image ? (
                  <motion.div
                    key="upload-zone"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    onClick={triggerFileSelect}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer min-h-[300px] transition-all duration-300 ${
                      isDragging 
                        ? (isDark ? "border-emerald-500 bg-emerald-950/20 scale-[0.99]" : "border-emerald-400 bg-emerald-50/50 scale-[0.99]") 
                        : (isDark ? "border-slate-800 hover:border-slate-700 hover:bg-slate-850/30" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/70")
                    }`}
                  >
                    <div className={`p-4 rounded-full mb-4 hover:scale-[1.05] transition-all duration-200 ${isDark ? "bg-slate-800 border border-slate-705 text-emerald-400" : "bg-slate-50 border border-slate-100 text-slate-600"}`}>
                      <Upload className="w-6 h-6" />
                    </div>
                    <span className={`text-sm font-medium mb-1 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                      Arraste sua imagem aqui
                    </span>
                    <span className={`text-xs mb-5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      ou clique para selecionar do dispositivo
                    </span>
                    
                    <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                      <span className={`text-[10px] uppercase font-mono px-2 py-1 rounded ${isDark ? "bg-slate-850 text-slate-400 border border-slate-800" : "bg-slate-100 text-slate-500"}`}>PNG</span>
                      <span className={`text-[10px] uppercase font-mono px-2 py-1 rounded ${isDark ? "bg-slate-850 text-slate-400 border border-slate-800" : "bg-slate-100 text-slate-500"}`}>JPG</span>
                      <span className={`text-[10px] uppercase font-mono px-2 py-1 rounded ${isDark ? "bg-slate-850 text-slate-400 border border-slate-800" : "bg-slate-100 text-slate-500"}`}>WEBP</span>
                      <span className={`text-[10px] uppercase font-mono px-2 py-1 rounded ${isDark ? "bg-slate-850 text-slate-400 border border-slate-800" : "bg-slate-100 text-slate-500"}`}>max 10mb</span>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="preview-zone"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="flex flex-col gap-4"
                  >
                    <div className={`relative rounded-xl overflow-hidden shadow-inner flex items-center justify-center group min-h-[300px] max-h-[450px] ${isDark ? "bg-slate-950 border border-slate-850" : "bg-slate-900 border border-slate-200/60"}`}>
                      <img 
                        src={image} 
                        alt="Preview" 
                        className="object-contain w-full max-h-[380px] pointer-events-none"
                        referrerPolicy="no-referrer"
                      />
                      
                      <div className="absolute top-3 right-3 flex gap-2">
                        <button
                          onClick={triggerFileSelect}
                          title="Substituir Imagem"
                          className={`backdrop-blur-sm p-2 rounded-lg shadow-sm transition-all hover:scale-105 active:scale-95 ${
                            isDark 
                              ? "bg-slate-900/90 text-slate-300 border border-slate-750 hover:bg-slate-800 hover:text-white" 
                              : "bg-white/90 text-slate-700 hover:text-slate-900 border border-slate-200/50 hover:bg-white"
                          }`}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleClear}
                          title="Limpar Imagem"
                          className="bg-red-500 text-white hover:bg-red-650 p-2 rounded-lg shadow-sm transition-all hover:scale-105 active:scale-95"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Barra de Ações Rápidas Abaixo do Preview */}
                    <div className="flex gap-2.5">
                      <button
                        onClick={triggerFileSelect}
                        className={`flex-1 border font-medium text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-98 ${
                          isDark 
                            ? "border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-850" 
                            : "border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50"
                        }`}
                      >
                        Substituir imagem
                      </button>
                      <button
                        onClick={handleClear}
                        className={`border font-medium text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-98 ${
                          isDark 
                            ? "border-red-950/40 text-red-400 hover:bg-red-950/20 bg-transparent" 
                            : "border-red-100 text-red-600 hover:bg-red-50/50 bg-white"
                        }`}
                      >
                        Remover
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Metadados e Informações do Arquivo */}
            {image && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`border rounded-2xl p-5 shadow-sm ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200/80"}`}
              >
                <div className={`flex items-center gap-2 border-b pb-3 mb-3 ${isDark ? "border-slate-800" : "border-slate-100"}`}>
                  <FileText className={`w-4 h-4 ${isDark ? "text-slate-400" : "text-slate-400"}`} />
                  <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-200" : "text-slate-900"}`}>Métricas do Arquivo</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className={`block mb-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>Nome do Arquivo</span>
                    <span className={`font-medium block truncate ${isDark ? "text-slate-300" : "text-slate-700"}`} title={fileName || ""}>{fileName}</span>
                  </div>
                  <div>
                    <span className={`block mb-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>Tamanho do Arquivo</span>
                    <span className={`font-mono font-medium block ${isDark ? "text-slate-300" : "text-slate-700"}`}>{fileSize}</span>
                  </div>
                  <div>
                    <span className={`block mb-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>Tipo/MIME</span>
                    <span className={`font-mono block ${isDark ? "text-slate-300" : "text-slate-700"}`}>{mimeType?.split("/")[1]?.toUpperCase() || "Desconhecido"}</span>
                  </div>
                  <div>
                    <span className={`block mb-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>Analisado em</span>
                    <span className={`font-medium block ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      {createdAt ? new Date(createdAt).toLocaleTimeString("pt-BR") : "—"}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Instruções / Critérios de Análise */}
            <div className={`border rounded-2xl p-5 flex flex-col gap-3 ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-200/60"}`}>
              <span className={`text-xs font-bold tracking-wider uppercase flex items-center gap-1.5 ${isDark ? "text-slate-205" : "text-slate-900"}`}>
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Parâmetros de Análise
              </span>
              <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-505"}`}>
                O VisionReader AI executa uma varredura visual completa identificando elementos fundamentais de maneira puramente factual:
              </p>
              <div className={`grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] font-medium ${isDark ? "text-slate-305" : "text-slate-600"}`}>
                <span className={`flex items-center gap-1 ${isDark ? "text-slate-300" : "text-slate-705"}`}>✓ Sujeitos & Ações</span>
                <span className={`flex items-center gap-1 ${isDark ? "text-slate-300" : "text-slate-75"}`}>✓ Relações Espaciais</span>
                <span className={`flex items-center gap-1 ${isDark ? "text-slate-300" : "text-slate-75"}`}>✓ Emoções Visíveis</span>
                <span className={`flex items-center gap-1 ${isDark ? "text-slate-300" : "text-slate-75"}`}>✓ Texturas & Cores</span>
              </div>
            </div>

            {/* Seção de Histórico de Sessão */}
            <div className={`border rounded-2xl p-5 shadow-sm flex flex-col gap-4 ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200/80"}`}>
              <div className={`flex items-center justify-between border-b pb-3 ${isDark ? "border-slate-800" : "border-slate-100"}`}>
                <div className="flex items-center gap-2">
                  <FileText className={`w-4 h-4 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
                  <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-200" : "text-slate-900"}`}>Histórico ({history.length}/5)</span>
                </div>
                {history.length > 0 && (
                  <button 
                    onClick={handleClearHistory}
                    className="text-[10px] uppercase font-mono font-bold text-red-500 hover:text-red-400 transition-colors"
                  >
                    Limpar tudo
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className={`text-center py-6 rounded-xl border border-dashed ${isDark ? "bg-slate-950/20 border-slate-800" : "bg-slate-50/50 border-slate-100"}`}>
                  <p className="text-xs text-slate-400 italic">Nenhuma análise anterior registrada.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectHistoryItem(item)}
                      className={`group flex gap-3 p-2 border rounded-xl cursor-pointer transition-all duration-200 items-center overflow-hidden ${
                        isDark 
                          ? "bg-slate-950/40 hover:bg-slate-800/80 border-slate-850 hover:border-slate-700" 
                          : "bg-slate-50 hover:bg-slate-100/80 border-slate-100 hover:border-slate-200"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-lg overflow-hidden shrink-0 flex items-center justify-center border shadow-inner ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-800 border-slate-200/60"}`}>
                        <img 
                          src={item.image} 
                          alt="Thumbnail" 
                          className="object-cover w-full h-full"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex-grow min-w-0">
                        <span className={`font-semibold text-xs block truncate transition-colors ${
                          isDark ? "text-slate-200 group-hover:text-emerald-400" : "text-slate-800 group-hover:text-emerald-600"
                        }`}>
                          {item.fileName}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                          <span>{item.fileSize}</span>
                          <span>•</span>
                          <span>{new Date(item.created_at).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                      
                      {/* Botão de Excluir individual */}
                      <button
                        onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                        className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 shrink-0 transition-all ${
                          isDark 
                            ? "text-slate-550 hover:text-red-400 hover:bg-red-950/40" 
                            : "text-slate-300 hover:text-red-500 hover:bg-red-50"
                        }`}
                        title="Remover do histórico"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Direita: Saída / Descrição Gerada (7 colunas no desktop) */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* Bloco de Resultado */}
            <div className={`border rounded-2xl p-6 shadow-sm min-h-[465px] flex flex-col justify-between transition-all duration-200 ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200/80"}`}>
              
              <AnimatePresence mode="wait">
                {/* 1. Estado Inicial: Apresentação Educacional */}
                {!image && !isLoading && !description && (
                  <motion.div
                    key="initial-screen"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col justify-between h-full"
                  >
                    <div className="flex flex-col gap-5">
                      <div className={`flex items-center gap-2 border-b pb-4 ${isDark ? "border-slate-800 text-slate-400" : "border-slate-100 text-slate-400"}`}>
                        <Info className="w-5 h-5 text-emerald-500" />
                        <span className={`font-display font-semibold text-base ${isDark ? "text-white" : "text-slate-900"}`}>Conceito Principal</span>
                      </div>
                      
                      <div className={`border rounded-xl p-5 mb-1 ${isDark ? "bg-emerald-950/10 border-emerald-900/40" : "bg-emerald-50/30 border-emerald-100/50"}`}>
                        <p className={`font-medium text-sm mb-3 ${isDark ? "text-emerald-400" : "text-emerald-800"}`}>
                          O que é o VisionReader AI?
                        </p>
                        <p className={`text-xs leading-relaxed mb-4 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                          É uma ferramenta de tradução e expansão semântica para profissionais criativos e usuários de Inteligência Artificial generativa. Em vez de criar comandos técnicos, o sistema observa as nuances e gera descrições factuais extremamente ricas para alimentar inteligências de imagem.
                        </p>
                        <blockquote className={`border-l-2 pl-3 italic text-xs font-mono ${isDark ? "border-emerald-600 text-slate-405" : "border-emerald-400 text-slate-500"}`}>
                          &quot;Leitor semântico de imagem para IA generativa.&quot;
                        </blockquote>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block font-mono">Metodologia Visual</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className={`border p-4 rounded-xl ${isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-100 bg-slate-50/50"}`}>
                            <span className={`text-xs font-bold block mb-1 ${isDark ? "text-slate-200" : "text-slate-900"}`}>✓ O que o sistema FAZ:</span>
                            <ul className={`text-[11px] space-y-1 list-none pl-0 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              <li className="flex items-center gap-1.5"><span className="text-emerald-500">●</span> Observação neutra e detalhada</li>
                              <li className="flex items-center gap-1.5"><span className="text-emerald-500">●</span> Identificação factual de objetos/pessoas</li>
                              <li className="flex items-center gap-1.5"><span className="text-emerald-500">●</span> Relações espaciais e texturas reais</li>
                            </ul>
                          </div>

                          <div className={`border p-4 rounded-xl ${isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-100 bg-slate-50/50"}`}>
                            <span className={`text-xs font-bold block mb-1 ${isDark ? "text-slate-205" : "text-slate-900"}`}>✗ O que o sistema NÃO faz:</span>
                            <ul className={`text-[11px] space-y-1 list-none pl-0 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              <li className="flex items-center gap-1.5"><span className="text-rose-500">●</span> Sem linguagens cinematográficas/lentes</li>
                              <li className="flex items-center gap-1.5"><span className="text-rose-500">●</span> Sem narrativas ou roteiros inventados</li>
                              <li className="flex items-center gap-1.5"><span className="text-rose-500">●</span> Sem clichês como &quot;masterpiece&quot;</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={`border-t pt-5 mt-6 ${isDark ? "border-slate-800" : "border-slate-100"}`}>
                      <div className={`border rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap md:flex-nowrap ${isDark ? "bg-slate-950/20 border-slate-805" : "bg-slate-50 border-slate-100"}`}>
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg border flex items-center justify-center ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}>
                            <ImageIcon className="w-5 h-5 text-slate-400" />
                          </div>
                          <div>
                            <span className={`text-xs font-semibold block ${isDark ? "text-slate-200" : "text-slate-805"}`}>Demonstração Prática</span>
                            <span className={`text-[11px] block ${isDark ? "text-slate-400" : "text-slate-500"}`}>Veja como a percepção simplificada humana é transformada em dados semânticos</span>
                          </div>
                        </div>
                        <button 
                          onClick={triggerFileSelect} 
                          className={`w-full md:w-auto font-medium text-xs px-3.5 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 ${
                            isDark 
                              ? "bg-slate-100 text-slate-950 hover:bg-white" 
                              : "bg-slate-900 text-white hover:bg-slate-800"
                          }`}
                        >
                          Começar Agora
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* 2. Estado de Carregamento (Loading com mensagens dinâmicas e spinner) */}
                {isLoading && (
                  <motion.div
                    key="loading-screen"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-16 h-full text-center"
                  >
                    {/* Spinner de alta qualidade com pulso duplo */}
                    <div className="relative mb-6">
                      <span className="absolute inline-flex h-16 w-16 rounded-full bg-emerald-400 opacity-20 animate-ping"></span>
                      <div className={`w-16 h-16 rounded-full border-4 animate-spin flex items-center justify-center ${isDark ? "border-slate-800 border-t-emerald-400" : "border-slate-100 border-t-emerald-500"}`}>
                        <Eye className="w-5 h-5 text-emerald-450" />
                      </div>
                    </div>

                    <h3 className={`text-base font-bold mb-1.5 ${isDark ? "text-white" : "text-slate-900"}`}>
                      Gerando descrição do leitor semântico
                    </h3>
                    
                    {/* Mensagem rotativa com transição suave */}
                    <div className="h-6 flex items-center justify-center">
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={loadingMsgIdx}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          transition={{ duration: 0.3 }}
                          className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}
                        >
                          {LOADING_MESSAGES[loadingMsgIdx]}
                        </motion.span>
                      </AnimatePresence>
                    </div>

                    <p className={`text-[11px] max-w-xs mt-4 leading-relaxed ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                      Este processo geralmente leva de 3 a 8 segundos. Estamos analisando detalhadamente os elementos visuais tangíveis da imagem.
                    </p>
                  </motion.div>
                )}

                {/* 3. Carregamento com Erro */}
                {error && !isLoading && (
                  <motion.div
                    key="error-screen"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-16 h-full text-center"
                  >
                    <div className={`p-4 rounded-full mb-4 ${isDark ? "bg-red-950/20 text-red-405" : "bg-red-50 text-red-500"}`}>
                      <AlertCircle className="w-8 h-8" />
                    </div>
                    <h3 className={`text-base font-bold mb-1 ${isDark ? "text-white" : "text-slate-900"}`}>
                      Falha na Análise Semântica
                    </h3>
                    <p className={`text-xs max-w-sm leading-relaxed mb-6 ${isDark ? "text-slate-400" : "text-slate-505"}`}>
                      {error}
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={handleRegenerate}
                        className={`font-medium text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-sm active:scale-95 ${
                          isDark 
                            ? "bg-slate-100 text-slate-950 hover:bg-white" 
                            : "bg-slate-900 text-white hover:bg-slate-800"
                        }`}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Tentar novamente
                      </button>
                      <button
                        onClick={handleClear}
                        className={`border font-medium text-xs px-4 py-2 rounded-lg transition-all active:scale-95 ${
                          isDark 
                            ? "border-slate-800 text-slate-400 bg-slate-950 hover:bg-slate-850" 
                            : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
                        }`}
                      >
                        Limpar imagem
                      </button>
                    </div>
                  </motion.div>
                )}
                 {/* 4. Resultado Pronto */}
                {description && !isLoading && !error && (
                  <motion.div
                    key="result-screen"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col justify-between h-full"
                  >
                    <div className="flex flex-col gap-4">
                      
                      <div className={`flex items-center justify-between border-b pb-3 ${isDark ? "border-slate-800" : "border-slate-100"}`}>
                        <span className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 ${isDark ? "text-white" : "text-slate-900"}`}>
                          <Sparkles className="w-3.5 h-3.5 text-emerald-500" /> Descrição Semântica Gerada
                        </span>
                        
                        <div className="flex gap-1.5">
                          <button
                            onClick={handleRegenerate}
                            title="Regenerar Descrição"
                            className={`border p-2 rounded-lg transition-all active:scale-95 ${
                              isDark 
                                ? "bg-slate-950/40 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-800" 
                                : "bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border-slate-200"
                            }`}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Abas de Idioma */}
                      <div className="flex gap-2 p-1 border rounded-xl w-fit bg-slate-50 border-slate-100 transition-colors dark:bg-slate-950/45 dark:border-slate-850">
                        <button
                          type="button"
                          onClick={() => setActiveLanguage("pt")}
                          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                            activeLanguage === "pt"
                              ? isDark
                                ? "bg-slate-800 text-white shadow-sm"
                                : "bg-white text-slate-900 shadow-sm"
                              : isDark
                                ? "text-slate-400 hover:text-slate-200"
                                : "text-slate-505 hover:text-slate-805"
                          }`}
                        >
                          Português (PT-BR)
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveLanguage("en")}
                          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 relative ${
                            activeLanguage === "en"
                              ? isDark
                                ? "bg-slate-800 text-white shadow-sm"
                                : "bg-white text-slate-900 shadow-sm"
                              : isDark
                                ? "text-slate-400 hover:text-slate-200"
                                : "text-slate-550 hover:text-slate-805"
                          }`}
                        >
                          English (EN)
                          {!descriptionEn && !isTranslating && (
                            <span className="absolute -top-1 -right-1 flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                          )}
                        </button>
                      </div>

                      {/* Caixa de Texto Resultante (Aesthetic Mono & Display block) */}
                      <div className={`relative border rounded-xl p-5 font-sans leading-relaxed text-sm shadow-inner min-h-[180px] max-h-[300px] overflow-y-auto selection:bg-emerald-100 ${
                        isDark 
                          ? "bg-slate-950/60 border-slate-850 text-slate-300" 
                          : "bg-slate-50/50 border-slate-100 text-slate-705"
                      }`}>
                        {activeLanguage === "pt" ? (
                          <p className={`whitespace-pre-line leading-relaxed font-sans text-sm selection:bg-emerald-100 ${isDark ? "text-slate-200" : "text-slate-900"}`}>
                            {description}
                          </p>
                        ) : descriptionEn ? (
                          <p className={`whitespace-pre-line leading-relaxed font-sans text-sm selection:bg-emerald-100 ${isDark ? "text-slate-200" : "text-slate-900"}`}>
                            {descriptionEn}
                          </p>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center py-6 px-2">
                            <Sparkles className="w-8 h-8 text-emerald-500 mb-2 animate-pulse" />
                            <h4 className="text-xs font-bold font-sans text-slate-800 dark:text-slate-200 mb-1">
                              Tradução para o Inglês Disponível
                            </h4>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mb-4 leading-relaxed">
                              Gere uma descrição em inglês otimizada para prompts em Midjourney, Stable Diffusion, Flux, e outros.
                            </p>
                            <button
                              type="button"
                              disabled={isTranslating}
                              onClick={handleTranslateToEnglish}
                              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 font-semibold text-white rounded-lg text-xs transition-all active:scale-95 shadow-sm flex items-center gap-1.5 disabled:opacity-75"
                            >
                              {isTranslating ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  Traduzindo...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-3 h-3" />
                                  Traduzir para Inglês
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Selo de qualidade / regras respeitadas */}
                      <div className={`border rounded-xl p-4 flex items-start gap-3 ${isDark ? "bg-emerald-950/15 border-emerald-900/30" : "bg-emerald-50/20 border-emerald-100/40"}`}>
                        <Shield className="w-4 h-4 text-emerald-450 mt-0.5 shrink-0" />
                        <div>
                          <span className={`text-xs font-semibold block mb-0.5 ${isDark ? "text-slate-200" : "text-slate-800"}`}>Atributos Semânticos Garantidos</span>
                          <span className={`text-[11px] leading-relaxed block ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            A descrição segue estritamente diretrizes observacionais: sem dramatizações, sem lentes fotográficas ou terminologias cinematográficas ocultas. Perfeito para uso direto em Midjourney, Stable Diffusion ou Flux.
                          </span>
                        </div>
                      </div>

                    </div>

                    {/* Rodapé do bloco - Botão de Cópia e Regeneração */}
                    <div className={`border-t pt-5 mt-6 flex flex-col sm:flex-row gap-3 ${isDark ? "border-slate-800" : "border-slate-100"}`}>
                      <button
                        onClick={activeLanguage === "pt" ? handleCopy : handleCopyEn}
                        disabled={activeLanguage === "en" && !descriptionEn}
                        className={`flex-grow md:flex-grow-0 sm:px-6 py-3 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                          (activeLanguage === "pt" ? copied : copiedEn)
                            ? "bg-emerald-500 text-white"
                            : isDark
                              ? "bg-slate-100 text-slate-950 hover:bg-white active:scale-98"
                              : "bg-slate-900 text-white hover:bg-slate-800 active:scale-98"
                        }`}
                      >
                        {(activeLanguage === "pt" ? copied : copiedEn) ? (
                          <>
                            <Check className="w-4 h-4" />
                            Copiado com Sucesso!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            {activeLanguage === "pt" ? "Copiar Descrição" : "Copy English Prompt"}
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleRegenerate}
                        className={`border font-medium text-xs py-3 px-5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-98 ${
                          isDark
                            ? "border-slate-800 hover:border-slate-750 text-slate-350 bg-slate-950 hover:bg-slate-850"
                            : "border-slate-200 hover:border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Gerar Novamente
                      </button>
                      <button
                        onClick={handleClear}
                        className={`border font-medium text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-98 sm:ml-auto ${
                          isDark
                            ? "border-red-955 text-red-400 bg-transparent hover:bg-red-950/20"
                            : "border-red-105 text-red-500 bg-white hover:bg-red-50/50"
                        }`}
                      >
                        Limpar Imagem
                      </button>
                    </div>

                  </motion.div>
                )}
              </AnimatePresence>

            </div>

          </div>

        </div>

        {/* Seção Informativo Inferior Educacional: Diferencial do Produto */}
        <section className={`mt-8 border-t pt-10 transition-colors duration-200 ${isDark ? "border-slate-900" : "border-slate-200/80"}`} id="education-gallery">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className={`font-display font-medium tracking-tight text-xl mb-1.5 ${isDark ? "text-white" : "text-slate-900"}`}>
              Como funciona a expansão semântica?
            </h2>
            <p className={`text-xs leading-relaxed ${isDark ? "text-slate-450" : "text-slate-500"}`}>
              O VisionReader AI elimina descrições rasas humanas substituindo-as por ricos detalhes tangíveis fundamentados.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Exemplo 1 */}
            <div className={`border rounded-2xl p-5 shadow-inner transition-all duration-200 ${isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"}`}>
              <span className={`text-xs font-bold uppercase tracking-widest block mb-2 font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>Exemplo 1: Pato na Lagoa</span>
              <div className="space-y-3">
                <div className={`border-l-2 pl-3 ${isDark ? "border-slate-700" : "border-slate-300"}`}>
                  <span className={`text-[10px] uppercase font-mono block ${isDark ? "text-slate-500" : "text-slate-400"}`}>Simples percepção humana</span>
                  <p className={`text-xs italic font-serif ${isDark ? "text-slate-350" : "text-slate-700"}`}>&quot;Pato numa lagoa.&quot;</p>
                </div>
                <div className="border-l-2 border-emerald-500 pl-3">
                  <span className="text-[10px] text-emerald-500 uppercase font-mono block font-bold">Visão semântica estendida</span>
                  <p className={`text-xs leading-relaxed font-sans ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    &quot;Pato branco de porte médio flutuando sobre água esverdeada calma, cabeça voltada para a direita, reflexo parcial visível na água, pequenas ondulações ao redor do corpo.&quot;
                  </p>
                </div>
              </div>
            </div>

            {/* Exemplo 2 */}
            <div className={`border rounded-2xl p-5 shadow-inner transition-all duration-200 ${isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"}`}>
              <span className={`text-xs font-bold uppercase tracking-widest block mb-2 font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>Exemplo 2: Homem no Banco</span>
              <div className="space-y-3">
                <div className="border-l-2 border-rose-500 pl-3">
                  <span className="text-[10px] text-rose-500 uppercase font-mono block font-bold">Incorreto (interpretação abstrata)</span>
                  <p className={`text-xs italic font-sans ${isDark ? "text-slate-450" : "text-slate-500"}`}>&quot;Homem refletindo profundamente sobre os erros da vida.&quot;</p>
                </div>
                <div className="border-l-2 border-emerald-500 pl-3">
                  <span className="text-[10px] text-emerald-500 uppercase font-mono block font-bold">Exemplo correto (observação factual)</span>
                  <p className={`text-xs leading-relaxed font-sans ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    &quot;Homem idoso usando casaco marrom sentado em banco de madeira, olhando para baixo com expressão triste, mãos apoiadas sobre uma bengala.&quot;
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className={`text-xs py-8 px-6 mt-12 border-t transition-colors duration-200 ${isDark ? "bg-slate-950 border-slate-900 text-slate-500" : "bg-slate-900 text-slate-400 border-slate-800"}`} id="footer_section">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-400" />
            <span className={`font-display font-semibold tracking-tight ${isDark ? "text-slate-200" : "text-white"}`}>VisionReader AI</span>
            <span className="text-[10px] text-slate-600 font-mono">v1.0-MVP</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] flex-wrap justify-center text-slate-500">
            <span>Desenvolvido sob diretrizes de IA generativa</span>
            <span className="text-slate-700">|</span>
            <span>Usa o modelo atualizado Gemini 3.5 Flash</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
