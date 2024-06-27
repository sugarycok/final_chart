from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import FinanceDataReader as fdr
from datetime import datetime, timedelta
from keras.models import Sequential
from keras.layers import LSTM, Dense
from keras.callbacks import EarlyStopping
from sklearn.preprocessing import MinMaxScaler
import matplotlib.dates as mdates
import os

plt.style.use('ggplot')

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    if request.method == 'POST':
        data = request.json
        print(data)
        stock_code = data.get('stockCode')
        if stock_code:
            result_file_path = run_stock_prediction(stock_code)
            return jsonify({'result_file': result_file_path})
        else:
            return jsonify({'error': "Stock code is missing."})

@app.route('/getGraphImage/<stock_code>')
def get_graph_image(stock_code):
    image_path = f'static/Result_{stock_code}.png'
    return send_from_directory(app.static_folder, image_path)

def run_stock_prediction(stock_code):
    if stock_code.endswith('.NY'):
        stock_code = stock_code[:-3]
        df = fdr.DataReader(stock_code, exchange='NYSE')
    elif stock_code.endswith('.NSQ'):
        stock_code = stock_code[:-4]
        df = fdr.DataReader(stock_code, exchange='NASDAQ')
    else:
        df = fdr.DataReader(stock_code)

    ma5 = df['Close'].rolling(window=5).mean()
    ma3 = df['Close'].rolling(window=3).mean()

    df['MA5'] = ma5
    df['MA3'] = ma3

    file_name = stock_code + '.csv'
    plot_file_name = 'static/Result_' + stock_code + '.png'

    if os.path.exists(plot_file_name):
        os.remove(plot_file_name)

    df.to_csv(file_name, date_format='%Y-%m-%d', index=True)

    raw_df = pd.read_csv(file_name)

    raw_df['Volume'] = raw_df['Volume'].replace(0, np.nan)
    raw_df = raw_df.dropna()

    scaler = MinMaxScaler()
    scale_cols = ['Open', 'High', 'Low', 'Close', 'MA3', 'MA5', 'Volume']
    scaled_df = scaler.fit_transform(raw_df[scale_cols])
    scaled_df = pd.DataFrame(scaled_df, columns=scale_cols)

    feature_cols = ['MA3', 'MA5', 'Close']
    label_cols = ['Close']

    feature_df = pd.DataFrame(scaled_df, columns=feature_cols)
    label_df = pd.DataFrame(scaled_df, columns=label_cols)

    feature_np = feature_df.to_numpy()
    label_np = label_df.to_numpy()

    def make_sequence_dataset(feature, label, window_size):
        feature_list = []
        label_list = []
        for i in range(len(feature) - window_size):
            feature_list.append(feature[i:i+window_size])
            label_list.append(label[i+window_size])
        return np.array(feature_list), np.array(label_list)

    window_size = 40
    X, Y = make_sequence_dataset(feature_np, label_np, window_size)

    split = -120
    x_train = X[:split]
    y_train = Y[:split]
    x_test = X[split:]
    y_test = Y[split:]

    model = Sequential()
    model.add(LSTM(128, activation='tanh', input_shape=x_train[0].shape))
    model.add(Dense(1, activation='linear'))
    model.compile(loss='mse', optimizer='adam', metrics=['mae'])

    early_stop = EarlyStopping(monitor='val_loss', patience=5)
    model.fit(x_train, y_train,
              validation_data=(x_test, y_test),
              epochs=100, batch_size=16,
              callbacks=[early_stop])

    pred = model.predict(x_test)

    y_test_inverse = y_test * (scaler.data_max_[3] - scaler.data_min_[3]) + scaler.data_min_[3]
    pred_inverse = pred * (scaler.data_max_[3] - scaler.data_min_[3]) + scaler.data_min_[3]

    future_dates = pd.date_range(start=datetime.now() + timedelta(days=1), periods=30, freq='D')
    last_sequence = x_test[-1]

    future_predictions = []
    for i in range(30):
        future_pred = model.predict(last_sequence.reshape(1, window_size, len(feature_cols)))
        future_predictions.append(future_pred[0, 0])
        last_sequence = np.roll(last_sequence, -1, axis=0)
        last_sequence[-1, -1] = future_pred

    future_predictions_inverse = np.array(future_predictions) * (scaler.data_max_[3] - scaler.data_min_[3]) + scaler.data_min_[3]

    mape = np.sum(abs(y_test_inverse - pred_inverse) / y_test_inverse) / len(x_test)
    print("MAPE:", mape)

    plt.figure(figsize=(12, 6))
    plt.title('3MA + 5MA + Adj Close, window_size=40')
    plt.ylabel('Price')
    plt.xlabel('Date')

    num_test_samples = len(y_test)
    date_range = pd.date_range(end=datetime.now(), periods=num_test_samples, freq='D')
    plt.plot(date_range, y_test_inverse, label='actual')
    plt.plot(date_range, pred_inverse, label='prediction')

    plt.plot(future_dates, future_predictions_inverse, label='future prediction')

    plt.grid()
    plt.legend(loc='best')

    plt.gca().xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))

    plt.savefig(plot_file_name)
    plt.close()

    return plot_file_name

if __name__ == '__main__':
    app.run(debug=True, port=8000)
