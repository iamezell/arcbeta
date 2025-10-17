import express, { Request, Response, Router } from 'express';

const router: Router = express.Router();

// Home page - role selection and lobby
router.get('/', (req: Request, res: Response) => {
  res.render('index', { title: 'ARC Beta - Multiplayer WebXR Theatre' });
});

// VR Scene page
router.get('/scene', (req: Request, res: Response) => {
  res.render('vrscene', { title: 'ARC Beta - VR Scene' });
});

export default router;

