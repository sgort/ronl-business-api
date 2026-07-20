FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY auth.py server.py ./

EXPOSE 8765

CMD ["python", "server.py"]
