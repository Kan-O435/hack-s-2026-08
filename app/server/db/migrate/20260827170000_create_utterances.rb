class CreateUtterances < ActiveRecord::Migration[8.1]
  def change
    create_table :utterances do |t|
      t.references :room, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.text :transcript, null: false
      t.datetime :spoken_at, null: false
      t.integer :duration_ms, null: false
      t.integer :pause_before_ms
      t.float :volume_drop_ratio
      t.float :speech_rate
      t.integer :realtime_score

      t.timestamps
    end
  end
end
