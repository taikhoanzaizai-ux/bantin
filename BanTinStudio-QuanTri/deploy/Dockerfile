FROM python:3.13-slim
WORKDIR /opt/bantin
COPY manager /opt/bantin/manager
COPY app/licensing.py /opt/bantin/app/licensing.py
COPY app/portable.py /opt/bantin/app/portable.py
ENV BTS_LICENSE_HOST=0.0.0.0 BTS_LICENSE_PORT=8788 BTS_LICENSE_DATA=/data BTS_PUBLIC_HTTPS=1 PYTHONUNBUFFERED=1
EXPOSE 8788
CMD ["python", "manager/license_server.py"]
