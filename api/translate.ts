import { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("A chave de API do Gemini (GEMINI_API_KEY) está ausente. Adicione-a nas variáveis de ambiente da Vercel.");
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers para habilitar requisições
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido. Utilize POST." });
  }

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

    return res.status(200).json({ translation: translation.trim() });
  } catch (error: any) {
    console.error("Erro na tradução do texto:", error);
    return res.status(500).json({
      error: error.message || "Ocorreu um erro interno durante a tradução do texto.",
    });
  }
}
