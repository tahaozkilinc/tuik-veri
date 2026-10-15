"""TÜRİB günlük PDF raporunu (Mısır 1./2. Sınıf özet) oluşturup mail olarak
gönderen CLI giriş noktası.

Kullanım:
    python -m turib.report_run                     # bugünü gönder
    python -m turib.report_run --date 2026-10-13    # belirli bir günü gönder

Alıcı listesi REPORT_TO ortam değişkeninden (virgülle ayrılmış) okunur.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import sys

from loader.supabase_loader import get_client
from turib.mailer import send_report_email
from turib.report import fetch_report_data, render_report_pdf

TR_TZ = dt.timezone(dt.timedelta(hours=3))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", type=str, default=None, help="YYYY-MM-DD, boş bırakılırsa bugün (TR saati)")
    args = parser.parse_args()

    trade_date = dt.date.fromisoformat(args.date) if args.date else dt.datetime.now(TR_TZ).date()

    try:
        client = get_client()
        data = fetch_report_data(client, trade_date)
        pdf_bytes = render_report_pdf(trade_date, data)

        to_addrs = [a.strip() for a in os.environ["REPORT_TO"].split(",") if a.strip()]
        date_str = trade_date.strftime("%d.%m.%Y")
        subject = f"TÜRİB Günlük Bülten Özeti — {date_str}"
        body = (
            "Merhaba,\n\n"
            f"{date_str} tarihli TÜRİB Normal Seans bülten özeti ekte PDF olarak yer almaktadır.\n\n"
            "Bu e-posta otomatik olarak gönderilmiştir.\n"
        )
        filename = f"turib-gunluk-bulten-{trade_date.isoformat()}.pdf"

        send_report_email(to_addrs, subject, body, pdf_bytes, filename)
        print(f"Mail gönderildi: {', '.join(to_addrs)} — {filename}")
        return 0

    except Exception as exc:  # noqa: BLE001
        print(f"HATA: {exc}", file=sys.stderr)
        raise


if __name__ == "__main__":
    raise SystemExit(main())
