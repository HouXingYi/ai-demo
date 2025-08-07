import { createBrowserRouter } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import AiChatPage from '../pages/AiChatPage';
import ImageAnalysisPage from '../pages/ImageAnalysisPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/ai-chat',
    element: <AiChatPage />,
  },
  {
    path: '/image-analysis',
    element: <ImageAnalysisPage />,
  },
  {
    // 404 页面重定向到首页
    path: '*',
    element: <HomePage />,
  },
]);