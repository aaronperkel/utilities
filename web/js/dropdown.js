function updateField() {
  var number = document.getElementById('total').value;
  var result = number / 3;
  result = Math.round(result * 100) / 100;
  document.getElementById('cost').value = result;
}   