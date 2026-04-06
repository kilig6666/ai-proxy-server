import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import configRouter from "./config.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(configRouter);

export default router;
