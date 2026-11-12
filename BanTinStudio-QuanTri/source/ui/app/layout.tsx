import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Quân Bản Tin — Từ kịch bản đến video',description:'Dựng video bản tin dọc 9:16 với giọng nam miền Bắc, hình ảnh và phụ đề.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}</body></html>;}
