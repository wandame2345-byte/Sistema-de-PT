import crypto from 'node:crypto';
const key=secret=>crypto.createHash('sha256').update(secret).digest();
export function encryptTokens(tokens,secret){const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key(secret),iv);const data=Buffer.concat([cipher.update(JSON.stringify(tokens),'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(x=>x.toString('base64url')).join('.')}
export function decryptTokens(value,secret){const [iv,tag,data]=value.split('.').map(x=>Buffer.from(x,'base64url'));const decipher=crypto.createDecipheriv('aes-256-gcm',key(secret),iv);decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8'))}
export function memberAllowed(member,roleId){return Array.isArray(member?.roles)&&member.roles.includes(roleId)&&member.pending!==true}
