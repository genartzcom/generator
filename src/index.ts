import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Import services
import { compileContract } from "./contract.compiler";
import { analyzeCode } from "./v2/p5.analyzer";
import { generateSolidityContract } from "./v2/solidity.finalize";
import * as p5Processor from "./process";
import { generateFormaCollectionCodes } from "./trait.generator";
import { logger } from "./logger";

import * as solformat from "./solformat";
import { formatYaml } from "./solformat";

const { formatSolidity } = solformat;

dotenv.config();

const PORT = process.env.PORT || 1337;
const TEMPLATE_PATH = path.join(__dirname, "templates", "Example2.sol");

let solidityTemplate: string;
try {
  solidityTemplate = fs.readFileSync(TEMPLATE_PATH, "utf-8");
} catch (error) {
  logger.error(
    `Failed to read template file: ${error instanceof Error ? error.message : "Unknown error"}`,
  );
  process.exit(1);
}

const app = express();

app.use(express.json({ limit: "11mb" }));
app.use(cors());
app.use(express.urlencoded({ extended: true }));

const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  logger.error(`Error: ${err.message}`);
  res.status(500).json({
    success: false,
    error: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};

const asyncHandler =
  (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

async function precompileP5(p5Code: string) {
  try {
    const decodedP5 = Buffer.from(p5Code, "base64").toString("utf-8");
    const analysisResults = analyzeCode(decodedP5);
    const contractCode = generateSolidityContract(decodedP5, solidityTemplate);
    const compilationResults = await compileContract(
      contractCode,
      "NFTCollection",
    );

    return {
      analysisResults,
      contractCode,
      compilationResults,
    };
  } catch (error) {
    logger.error(
      `Precompilation error: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    throw error;
  }
}

app.post(
  "/api/precompile",
  asyncHandler(async (req: Request, res: Response) => {
    const { p5Code } = req.body;

    console.log("code", p5Code);
    if (!p5Code) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: p5",
      });
    }

    try {
      const { analysisResults, contractCode, compilationResults } =
        await precompileP5(p5Code);

      const formattedCode = await formatSolidity(contractCode);

      return res.status(200).json({
        success: true,
        data: {
          analysis: analysisResults,
          contract: formattedCode,
          compiledContract: compilationResults,
        },
      });
    } catch (err) {
      return res
        .status(400)
        .json({
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
    }
  }),
);

app.post(
  "/api/yamldata",
  asyncHandler(async (req: Request, res: Response) => {
    const { p5Code } = req.body;

    if (!p5Code) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: p5",
      });
    }

    try {
      const analyzedData = analyzeCode(p5Code);


      return res.status(200).json({
        success: true,
        data: {
          yamlData: JSON.stringify(analyzedData),
        },
      });
    } catch (err) {
      return res
        .status(400)
        .json({
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
    }
  }),
);

app.post(
  "/api/p5compile",
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: code",
      });
    }

    try {
      const decodedP5 = Buffer.from(code, "base64").toString("utf-8");
      const analysisResults = analyzeCode(decodedP5);
      const processedP5 = p5Processor.process(decodedP5);
      const header = await generateFormaCollectionCodes(analysisResults.data);

      let warning = "";
      header.collections.forEach((l) => {
        if (l.metadataSource !== "forma") {
          warning += `// ${l.collectionName} metadata source is not forma!\n\n`;
          console.log(warning);
        }
      });

      const processedCode = Buffer.from(
        header.combinedCode + processedP5,
      ).toString("base64");

      return res.status(200).json({
        success: true,
        data: {
          code: processedCode,
          warning: warning,
        },
      });
    } catch (e) {
      return res.status(400).json({ success: false, error: "error" });
    }
  }),
);

app.post(
  "/api/deploy",
  asyncHandler(async (req: Request, res: Response) => {
    const { address, title, description, price, supply, code } = req.body;

    if (!address || !title || !description || !price || !supply || !code) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    const { analysisResults, contractCode, compilationResults } =
      await precompileP5(code);

    const contractBase64 = Buffer.from(contractCode).toString("base64");

    const collectionId =
      Date.now().toString(36) + Math.random().toString(36).substring(2);

    logger.info(`Deployment initiated for collection: ${title} by ${address}`);

    return res.status(200).json({
      success: true,
      data: {
        id: collectionId,
        analysis: analysisResults,
        contract: contractBase64,
        compiledContract: compilationResults,
      },
    });
  }),
);

app.get(
  "/api/editor/example",
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const examplePath = path.join(__dirname, "example", "p5.example.js");
      const exampleCode = fs.readFileSync(examplePath, "utf-8");

      return res.status(200).json({
        success: true,
        code: exampleCode,
      });
    } catch (error) {
      logger.error(
        `Error fetching example: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return res.status(500).json({
        success: false,
        error: "Failed to fetch example code",
      });
    }
  }),
);

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

process.on("unhandledRejection", (reason: Error) => {
  logger.error(`Unhandled Rejection: ${reason.message}`);
  logger.error(reason.stack || "");
});

process.on("uncaughtException", (error: Error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  logger.error(error.stack || "");
  process.exit(1);
});

export default app;
