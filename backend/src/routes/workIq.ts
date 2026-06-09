import { Router, Request, Response } from "express";
import { getCityContext } from "../graphContext";

export const workIqRouter = Router();

workIqRouter.get("/context", async (_req: Request, res: Response) => {
  try {
    res.json(await getCityContext(false));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

workIqRouter.post("/refresh", async (_req: Request, res: Response) => {
  try {
    res.json(await getCityContext(true));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
