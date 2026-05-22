import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Lazy initialization do Gemini para evitar crashes no boot se a chave estiver ausente
let aiInstance: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("A chave de API do Gemini (GEMINI_API_KEY) está ausente. Por favor, adicione sua chave de API nos Segredos (Settings > Secrets) no painel esquerdo.");
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Permite receber dados JSON grandes para o envio de imagens em base64
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ limit: "15mb", extended: true }));

  // API de análise de imagem utilizando o Gemini (Gera ambas as versões de uma vez)
  app.post("/api/analyze", async (req, res) => {
    try {
      const { image, mimeType } = req.body;

      if (!image) {
        return res.status(400).json({ error: "Nenhuma imagem foi fornecida para análise." });
      }

      if (!mimeType) {
        return res.status(400).json({ error: "O formato mine-type da imagem não foi especificado." });
      }

      // Garante que pegamos apenas os dados base64 brutos
      let base64Data = image;
      if (image.includes(";base64,")) {
        base64Data = image.split(";base64,").pop() || "";
      }

      const ai = getGeminiClient();

      // Prompt sugerido na página 7 do PDF do VisionReader AI, adaptado para fornecer ambas as línguas estruturalmente
      const promptPrincipal = `Descreva esta imagem de forma objetiva e detalhada, focando apenas em elementos visualmente observáveis. Inclua sujeitos, aparência, ações, expressões, emoções visíveis, objetos, ambiente e relações espaciais. Não utilize termos técnicos de fotografia, cinematografia ou direção de arte. Não invente narrativa, contexto emocional profundo ou informações não visíveis.
      
Forneça a resposta estruturada estritamente em duas versões:
1. Uma descrição rica e detalhada em Português Brasileiro (campo "description").
2. Uma versão correspondente detalhada em Inglês (campo "description_en").`;

      const imagePart = {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: [imagePart, { text: promptPrincipal }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: {
                type: Type.STRING,
                description: "Descrição detalhada em português brasileiro",
              },
              description_en: {
                type: Type.STRING,
                description: "Descrição detalhada traduzida para o inglês",
              },
            },
            required: ["description", "description_en"],
          },
        },
      });

      let description = "";
      let descriptionEn = "";

      if (response.text) {
        try {
          const parsed = JSON.parse(response.text.trim());
          description = parsed.description || "Não foi possível gerar uma descrição em português brasileiro.";
          descriptionEn = parsed.description_en || "";
        } catch (parseErr) {
          console.error("Erro ao realizar o parse do JSON de retorno:", parseErr);
          description = response.text;
        }
      } else {
        description = "Não foi possível gerar uma descrição semântica para esta imagem.";
      }

      // Retornamos a descrição em ambas as línguas
      const result = {
        image: image, // Retornamos o data URL completo ou original
        description: description.trim(),
        description_en: descriptionEn.trim(),
        created_at: new Date().toISOString(),
      };

      return res.json(result);
    } catch (error: any) {
      console.error("Erro na análise da imagem:", error);
      return res.status(500).json({
        error: error.message || "Ocorreu um erro interno durante a análise semântica da imagem.",
      });
    }
  });

  // API para traduzir descrições (por exemplo, de itens antigos do histórico) de PT para EN
  app.post("/api/translate", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Nenhum texto foi fornecido para tradução." });
      }

      const ai = getGeminiClient();
      const promptTraducao = `Você é um tradutor especialista em prompts de imagens para IA generativa.
Traduza o seguinte texto descritivo em português brasileiro para o inglês de forma extremamente natural, clara e semanticamente equivalente. Preserve todos os detalhes físicos, ações, cores, texturas e relações espaciais. Não remova detalhes nem adicione floreios desnecessários.

Texto para tradução:
"${text}"

Retorne apenas o texto traduzido final de forma limpa, sem qualquer introdução, aspas externas ou observações.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: promptTraducao,
      });

      const translation = response.text || "";

      return res.json({ translation: translation.trim() });
    } catch (error: any) {
      console.error("Erro na tradução do texto:", error);
      return res.status(500).json({
        error: error.message || "Ocorreu um erro interno durante a tradução do texto.",
      });
    }
  });

  // Setup do Vite de acordo com as instruções de ambiente (Development vs Production)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[VisionReader AI] Servidor Express iniciado na porta ${PORT} de forma bem-sucedida.`);
  });
}

startServer().catch((error) => {
  console.error("Falha ao iniciar o servidor da aplicação:", error);
});
