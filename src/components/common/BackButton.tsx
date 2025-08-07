import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

interface BackButtonProps {
  to?: string;
  title?: string;
}

const BackButton: React.FC<BackButtonProps> = ({ to = '/', title = '返回首页' }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(to);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 20,
      left: 20,
      zIndex: 1000,
      background: 'rgba(255, 255, 255, 0.9)',
      borderRadius: 8,
      padding: 4
    }}>
      <Button
        type="primary"
        icon={<ArrowLeftOutlined />}
        onClick={handleBack}
        size="large"
      >
        {title}
      </Button>
    </div>
  );
};

export default BackButton;
