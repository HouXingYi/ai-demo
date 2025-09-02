import cors from 'cors';
import express from 'express';

// 基础中间件配置 - 支持所有来源的跨域请求
export const configureCors = () => {
  return cors({
    origin: true, // 允许所有来源
    credentials: true, // 允许携带凭据
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  });
};

export const configureJson = () => {
  return express.json();
};
