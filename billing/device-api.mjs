import {createServer} from 'node:http';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {createDeviceHandler} from './device-handler.mjs';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw new Error('Este servidor aceita somente os emuladores locais.');
const app=initializeApp({projectId:'demo-caderno-billing'});
createServer(createDeviceHandler({auth:getAuth(app),db:getFirestore(app)})).listen(5175,'127.0.0.1',()=>console.log('Dispositivos: servidor de teste em http://127.0.0.1:5175 (somente emuladores).'));
