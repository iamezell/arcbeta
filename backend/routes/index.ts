import express, { Request, Response, Router } from 'express';
import { getNetworkInfo } from '../utils/networkInfo';
import { getShowCode } from '../show/session';

const router: Router = express.Router();

// Home page - role selection and lobby
router.get('/', (req: Request, res: Response) => {
  res.render('index', { title: 'ARC Beta - Multiplayer WebXR Theatre' });
});

// VR Scene page
router.get('/scene', (req: Request, res: Response) => {
  res.render('vrscene', { title: 'ARC Beta - VR Scene' });
});

// Host/Director "Scan to Join" screen (QR + URL + connected participants).
router.get('/join-screen', (req: Request, res: Response) => {
  const showCode = getShowCode();
  const info = getNetworkInfo({ joinPath: '/join', showCode });
  res.render('join-screen', { title: 'ARC - Scan to Join', info, showCode });
});

// Mobile/headset-friendly audience join page.
router.get('/join', (req: Request, res: Response) => {
  const showCode = (req.query.show as string) || getShowCode();
  res.render('join', { title: 'Join ARC', showCode });
});

export default router;

