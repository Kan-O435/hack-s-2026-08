class AddSneerDetectedToUtterances < ActiveRecord::Migration[8.1]
  def change
    add_column :utterances, :sneer_detected, :boolean, null: false, default: false
  end
end
