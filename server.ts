import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";

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

  // API para gerar prompts a partir de imagem (base64 ou URL) e instruções, com base nas diretrizes
  app.post("/api/generate-prompt", async (req, res) => {
    try {
      const { image, mimeType, imageUrl, userRequest } = req.body;
      let base64Data = image;
      let finalMimeType = mimeType;

      if (imageUrl && !base64Data) {
        try {
          const imageResponse = await fetch(imageUrl);
          if (!imageResponse.ok) {
            throw new Error(`Falha ao obter imagem da URL fornecida (HTTP ${imageResponse.status})`);
          }
          const arrayBuffer = await imageResponse.arrayBuffer();
          base64Data = Buffer.from(arrayBuffer).toString("base64");
          finalMimeType = imageResponse.headers.get("content-type") || "image/jpeg";
        } catch (fetchErr: any) {
          console.error("Erro ao baixar imagem da URL:", fetchErr);
          return res.status(400).json({ error: `Não foi possível acessar a URL da imagem: ${fetchErr.message}` });
        }
      }

      // Função para ler as diretrizes
      let guidelinesText = "";
      try {
        const guidelinesDir = path.join(process.cwd(), "guidelines");
        if (fs.existsSync(guidelinesDir)) {
          const files = fs.readdirSync(guidelinesDir);
          let combined = "";
          for (const file of files) {
            if (file.endsWith(".txt")) {
              const content = fs.readFileSync(path.join(guidelinesDir, file), "utf-8");
              combined += `\n\n=== DOCUMENTO DE REFERÊNCIA: ${file} ===\n${content}\n`;
            }
          }
          if (combined.trim().length > 0) {
            guidelinesText = combined;
          }
        }
      } catch (err) {
        console.error("Erro ao ler diretrizes do disco:", err);
      }

      if (!guidelinesText) {
        guidelinesText = `
[DIRETRIZES DE ENGENHARIA DE PROMPT CONSOLIDADA - FALLBACK]
1. ESTRUTURA DE 4 PILARES DO PROMPT:
   - OBJETIVO (Goal): Seja cirúrgico. Use verbos imperativos e técnicos (ex: "Sintetize", "Esboce", "Codifique", "Classifique"). Quantifique sempre que possível.
   - CONTEXTO (Context/Role): Defina a persona de alto nível (ex: "Aja como um fotógrafo profissional da National Geographic") e forneça dados ou referências de suporte.
   - RESTRIÇÕES (Constraints): Limite o espaço de busca. Especifique formatos de saída, limite de tamanho e evite termos vagos ou subjetivos (como "lindo", "ultra-detalhado", "masterpiece").
   - EXEMPLOS (Few-shot): Forneça exemplos práticos de pares entrada/saída para orientar o tom, cadência e estilo de saída.

2. CADEIA DE RACIOCÍNIO (Chain-of-Thought - CoT):
   - Divida tarefas cognitivas complexas em etapas lógicas intermediárias.
   - Sempre induza o modelo a justificar ou explicar seu raciocínio passo a passo antes de entregar a resposta final.

3. DIRETRIZES ESPECÍFICAS PARA GERAÇÃO DE IMAGENS:
   - FOTORREALISMO: Detalhe iluminação (ex: Chiaroscuro, luz de estúdio), especifique lentes (ex: 35mm f/1.8, 85mm), tipo de câmera, ângulo, texturas reais de pele/tecido, objetos específicos e composição.
   - ARTÍSTICO: Especifique movimentos artísticos (ex: Impressionismo, Surrealismo), técnicas (ex: pintura a óleo, aquarela) e influências de pintores.
   - ABSTRATO: Utilize formas, cores contrastantes (paletas hexadecimais ou descritivas) e texturas dinâmicas para evocar sentimentos ou conceitos claros.
   - ITERAÇÃO DE PROMPTS: O design de prompt é cíclico. Ajuste ordem dos fatores (arquivos/imagens devem vir antes das instruções textuais para prompts multimodais), reformule palavras-chave e quantifique.
`;
      }

      const ai = getGeminiClient();

      const promptBase = `Você é um Engenheiro de Prompt de Elite (Master Prompt Engineer).
Sua missão é criar o melhor prompt de imagem possível para ser usado em modelos generativos como Midjourney, Stable Diffusion ou Flux.

O usuário forneceu os seguintes insumos:
${userRequest ? `- Instrução/Pedido do usuário: "${userRequest}"` : "- Nenhuma instrução adicional do usuário foi fornecida. Crie um prompt de imagem fiel e detalhado a partir da imagem fornecida."}

Para realizar esta tarefa de forma primorosa, você DEVE seguir fielmente as diretrizes de engenharia de prompt que foram extraídas dos PDFs oficiais do projeto e listadas abaixo:
--------------------------------------------------
${guidelinesText}
--------------------------------------------------

Siga este processo cognitivo obrigatório (sua Cadeia de Raciocínio - Chain-of-Thought):
1. **Análise de Características Visuais:** Se uma imagem de referência estiver presente, identifique seus sujeitos, ações, iluminação específica (ex: luz dramática, chiaroscuro), estilo artístico (ex: surrealismo, fotografia macro, vetor plano), paleta de cores dominante e composição de câmera (ex: ângulo holandês, lente 85mm f/1.4).
2. **Arquitetura do Prompt (4 Pilares):**
   - **Objetivo:** Use verbos de ação imperativos no início da instrução.
   - **Contexto:** Defina a persona de câmera ou a atmosfera necessária para a IA de imagem.
   - **Restrições:** Exclua termos vagos e estipule restrições técnicas (como proporção de tela, coisas a evitar).
   - **Exemplos:** Indique texturas tangíveis e referências para guiar a modelagem.
3. **Refinamento e Tradução:** Crie o prompt de imagem final expandido e rico em detalhes factuais em Português Brasileiro e também sua versão técnica correspondente traduzida para o Inglês, pronta para uso direto no Midjourney/Flux.

Forneça sua resposta estritamente estruturada em JSON seguindo este esquema:`;

      const contents: any[] = [];

      if (base64Data && finalMimeType) {
        let rawBase64 = base64Data;
        if (base64Data.includes(";base64,")) {
          rawBase64 = base64Data.split(";base64,").pop() || "";
        }
        contents.push({
          inlineData: {
            mimeType: finalMimeType,
            data: rawBase64,
          },
        });
      }

      contents.push({ text: promptBase });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reasoning: {
                type: Type.STRING,
                description: "Cadeia de Raciocínio (Chain-of-Thought) detalhando o passo a passo da aplicação das diretrizes dos PDFs na criação do prompt.",
              },
              prompt: {
                type: Type.STRING,
                description: "O prompt de imagem altamente detalhado e estruturado em português brasileiro.",
              },
              prompt_en: {
                type: Type.STRING,
                description: "O prompt de imagem traduzido e adaptado para inglês, ideal para Midjourney/Flux/Stable Diffusion.",
              },
            },
            required: ["reasoning", "prompt", "prompt_en"],
          },
        },
      });

      let reasoning = "";
      let prompt = "";
      let promptEn = "";

      if (response.text) {
        try {
          const parsed = JSON.parse(response.text.trim());
          reasoning = parsed.reasoning || "";
          prompt = parsed.prompt || "";
          promptEn = parsed.prompt_en || "";
        } catch (parseErr) {
          console.error("Erro ao realizar o parse do JSON de retorno:", parseErr);
          prompt = response.text;
        }
      } else {
        throw new Error("Não foi possível obter resposta do Gemini.");
      }

      const result = {
        image: base64Data ? `data:${finalMimeType};base64,${base64Data}` : null,
        reasoning: reasoning.trim(),
        prompt: prompt.trim(),
        prompt_en: promptEn.trim(),
        created_at: new Date().toISOString(),
      };

      return res.json(result);
    } catch (error: any) {
      console.error("Erro na geração de prompt:", error);
      return res.status(500).json({
        error: error.message || "Ocorreu um erro interno durante a geração do seu prompt.",
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
