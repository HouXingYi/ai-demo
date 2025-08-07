import cors from 'cors';
import express from 'express';

// 基础中间件配置
export const configureCors = () => {
  return cors();
};

export const configureJson = () => {
  return express.json();
};
