import { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import path from "path";

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

// Carrega as diretrizes dos arquivos txt extraídos ou usa o fallback consolidado
function getGuidelinesText(): string {
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
        return combined;
      }
    }
  } catch (err) {
    console.error("Erro ao ler diretrizes do disco:", err);
  }

  return `
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
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
    const { image, mimeType, imageUrl, userRequest } = req.body;
    let base64Data = image;
    let finalMimeType = mimeType;

    // Se uma URL de imagem for fornecida, fazemos o download no servidor
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

    const guidelinesText = getGuidelinesText();
    const ai = getGeminiClient();

    // Prompt construído seguindo rigorosamente as diretrizes (incluindo ordem dos fatores)
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

    // Se houver uma imagem (seja por upload ou baixada via URL), adicionamos antes do texto (seguindo a página 1 da diretriz de iteração de prompt: "em comandos multimodais, adicione arquivos antes das instruções")
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

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Erro na geração de prompt:", error);
    return res.status(500).json({
      error: error.message || "Ocorreu um erro interno durante a geração do seu prompt.",
    });
  }
}
