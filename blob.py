from flask import Flask, request, jsonify
import FinanceDataReader as fdr
import logging

app = Flask(__name__)

# CORS 헤더 추가
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'  # 모든 도메인에서 요청 허용
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'  # GET, POST, OPTIONS 요청 허용
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'  # Content-Type 헤더 허용
    return response

# 주식 코드를 받아와 회사 이름 반환하는 함수
def find_company_name(stock_code):
    try:
        # 한국 주식 시장(KRX)에서 회사 이름을 검색합니다.
        kr_stocks = fdr.StockListing('KRX')
        kr_company_name = kr_stocks[kr_stocks['Code'] == stock_code]['Name'].values[0]
    except IndexError:
        kr_company_name = None

    try:
        # 미국 뉴욕증권거래소(NYSE)에서 회사 이름을 검색합니다.
        nyse_stocks = fdr.StockListing('NYSE')
        nyse_company_name = nyse_stocks[nyse_stocks['Symbol'] == stock_code]['Name'].values[0]
    except IndexError:
        nyse_company_name = None

    try:
        # 미국 나스닥(NASDAQ)에서 회사 이름을 검색합니다.
        nasdaq_stocks = fdr.StockListing('NASDAQ')
        nasdaq_company_name = nasdaq_stocks[nasdaq_stocks['Symbol'] == stock_code]['Name'].values[0]
    except IndexError:
        nasdaq_company_name = None

    return kr_company_name, nyse_company_name, nasdaq_company_name

# 주식 코드를 받아와 회사 이름을 반환하는 라우트
@app.route('/get_company_name', methods=['POST'])
def get_company_name():
    data = request.json
    stock_code = data.get('stockCode', '')
    
    # 회사 이름을 찾습니다.
    kr_company_name, nyse_company_name, nasdaq_company_name = find_company_name(stock_code)

    # 찾은 회사 이름 중에 존재하는 것만 필터링합니다.
    existing_companies = {market: name for market, name in {
        "한국 주식 시장": kr_company_name,
        "뉴욕증권거래소": nyse_company_name,
        "나스닥": nasdaq_company_name
    }.items() if name}

    app.logger.info(f"Received stock code: {stock_code}. Found companies: {existing_companies}")

    # 키 값을 포함하여 데이터를 반환합니다.
    return jsonify({"success": True, "companies": existing_companies})

# 서버 실행
if __name__ == '__main__':
    app.logger.setLevel(logging.INFO)  # 로그 레벨 설정
    console_handler = logging.StreamHandler()  # 콘솔 핸들러 생성
    app.logger.addHandler(console_handler)  # 로거에 콘솔 핸들러 추가
    app.run(debug=True)
