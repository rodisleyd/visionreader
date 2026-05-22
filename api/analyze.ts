import { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";

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
    const { image, mimeType } = req.body;

    if (!image) {
      return res.status(400).json({ error: "Nenhuma imagem foi fornecida para análise." });
    }

    if (!mimeType) {
      return res.status(400).json({ error: "O formato mime-type da imagem não foi especificado." });
    }

    // Garante que pegamos apenas os dados base64 brutos
    let base64Data = image;
    if (image.includes(";base64,")) {
      base64Data = image.split(";base64,").pop() || "";
    }

    const ai = getGeminiClient();

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

    const result = {
      image: image,
      description: description.trim(),
      description_en: descriptionEn.trim(),
      created_at: new Date().toISOString(),
    };

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Erro na análise da imagem:", error);
    return res.status(500).json({
      error: error.message || "Ocorreu um erro interno durante a análise semântica da imagem.",
    });
  }
}
