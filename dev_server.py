"""
Локальный dev-сервер для catan.
Автоматически отключает кеширование всех файлов.
Запуск: python dev_server.py
"""
import http.server
import socketserver
import os

PORT = 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Запрещаем кешировать всё
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        # Приглушаем логи
        pass


with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"✅ Сервер запущен на http://localhost:{PORT}")
    print(f"   Все файлы отдаются БЕЗ кеша — правки видны сразу.")
    print(f"   Остановить: Ctrl+C")
    httpd.serve_forever()